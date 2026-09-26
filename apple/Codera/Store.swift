import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseStorage
import AVFoundation

/** A post, a short, a video or a saved stream — one `posts` document. */
struct Post: Identifiable, Hashable {
  let id: String
  let uid: String
  let type: String
  let title: String
  let body: String?
  let code: String?
  let language: String?
  let imageUrl: String?
  /// Every picture on the post. Older posts carry one, in `imageUrl`.
  let imageUrls: [String]
  let videoUrl: String?
  /// How long a video runs, in seconds, as the uploader measured it.
  let duration: Double?
  let authorName: String
  let authorPhoto: String?
  let createdAt: Date?
  let likeCount: Int
  let dislikeCount: Int
  let commentCount: Int

  init(id: String, data: [String: Any]) {
    self.id = id
    uid = data["uid"] as? String ?? ""
    type = data["type"] as? String ?? "post"
    title = data["title"] as? String ?? ""
    body = data["body"] as? String
    code = data["code"] as? String
    language = data["lang"] as? String ?? data["language"] as? String
    imageUrl = data["imageUrl"] as? String
    // The list is what a post carries now; the single one is what it carried
    // before, and what an app too old to know about the list still writes.
    if let many = data["imageUrls"] as? [String], !many.isEmpty {
      imageUrls = many
    } else {
      imageUrls = (data["imageUrl"] as? String).map { [$0] } ?? []
    }
    videoUrl = data["videoUrl"] as? String
    duration = data["duration"] as? Double
    authorName = data["authorName"] as? String ?? "someone"
    authorPhoto = data["authorPhoto"] as? String
    createdAt = (data["createdAt"] as? Timestamp)?.dateValue()
    likeCount = data["likeCount"] as? Int ?? 0
    dislikeCount = data["dislikeCount"] as? Int ?? 0
    commentCount = data["commentCount"] as? Int ?? 0
  }

  var hasVideo: Bool { type == "short" || type == "video" || type == "live" }
}

/** One thing somebody said under a post: a `posts/{id}/comments` document. */
struct Comment: Identifiable, Hashable {
  let id: String
  let uid: String
  let text: String
  let authorName: String
  let authorPhoto: String?
  let createdAt: Date?

  init(id: String, data: [String: Any]) {
    self.id = id
    uid = data["uid"] as? String ?? ""
    text = data["text"] as? String ?? ""
    authorName = data["authorName"] as? String ?? "someone"
    authorPhoto = data["authorPhoto"] as? String
    createdAt = (data["createdAt"] as? Timestamp)?.dateValue()
  }
}

/** What someone chose to show about themselves: `profiles/{uid}`. */
struct Profile {
  let username: String?
  let bio: String?
  let photoUrl: String?
  let bannerUrl: String?

  init(_ data: [String: Any]) {
    username = data["username"] as? String
    bio = data["bio"] as? String
    photoUrl = data["photoUrl"] as? String
    bannerUrl = data["bannerUrl"] as? String
  }
}

/**
 * Who is signed in, and what everyone has posted.
 *
 * One Firestore listener feeds every screen, as in the other apps: the feed is
 * the newest 150 posts, ordered by when they were made.
 */
@MainActor
final class Store: ObservableObject {
  @Published var user: User?
  @Published var ready = false
  @Published var username: String?
  @Published var posts: [Post] = []
  @Published var following: Set<String> = []
  @Published var profiles: [String: Profile] = [:]
  @Published var loadError: String?

  private var authHandle: AuthStateDidChangeListenerHandle?
  private var postsListener: ListenerRegistration?
  private var profileListener: ListenerRegistration?
  private var followsListener: ListenerRegistration?
  private var blocksListener: ListenerRegistration?
  /// The feed as it came, before anybody blocked is taken out of it.
  private var everything: [Post] = []

  init() {
#if DEBUG
    // For checking layouts on a simulator: launching with
    // `-signInEmail someone@example.com -signInPassword …` signs in without
    // anyone typing. Debug builds only, so it can't ship.
    let launch = UserDefaults.standard
    if Auth.auth().currentUser == nil,
       let email = launch.string(forKey: "signInEmail"),
       let password = launch.string(forKey: "signInPassword") {
      Task { try? await Auth.auth().signIn(withEmail: email, password: password) }
    }
#endif
    authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
      Task { @MainActor in
        guard let self else { return }
        self.user = user
        self.ready = true
        self.watchProfile()
        self.watchFollows()
        self.watchBlocks()
        self.watchPosts()
      }
    }
  }

  private func watchPosts() {
    guard user != nil, postsListener == nil else {
      if user == nil { postsListener?.remove(); postsListener = nil; posts = [] }
      return
    }
    postsListener = Firestore.firestore().collection("posts")
      .order(by: "createdAt", descending: true).limit(to: 150)
      .addSnapshotListener { [weak self] snap, error in
        Task { @MainActor in
          guard let self else { return }
          if let error { self.loadError = error.localizedDescription; return }
          self.loadError = nil
          self.everything = snap?.documents.map { Post(id: $0.documentID, data: $0.data()) } ?? []
          self.sift()
          self.learnFaces()
        }
      }
  }

  /// Shorts are the same posts, told apart by their type.
  var shorts: [Post] { posts.filter { $0.type == "short" } }

  /// The newest from the people you follow.
  var followed: [Post] { posts.filter { following.contains($0.uid) } }

  private func watchFollows() {
    followsListener?.remove()
    followsListener = nil
    guard let uid = user?.uid else { following = []; return }
    followsListener = Firestore.firestore().collection("follows").whereField("from", isEqualTo: uid)
      .addSnapshotListener { [weak self] snap, _ in
        Task { @MainActor in
          self?.following = Set(snap?.documents.compactMap { $0.get("to") as? String } ?? [])
        }
      }
  }

  private func watchProfile() {
    profileListener?.remove()
    profileListener = nil
    guard let uid = user?.uid else { username = nil; return }
    profileListener = Firestore.firestore().document("profiles/\(uid)")
      .addSnapshotListener { [weak self] snap, _ in
        Task { @MainActor in self?.username = snap?.get("username") as? String }
      }
  }

  /// Somebody's page, fetched once and kept.
  func loadProfile(_ uid: String) async {
    guard profiles[uid] == nil else { return }
    let snap = try? await Firestore.firestore().document("profiles/" + uid).getDocument()
    if let data = snap?.data() { profiles[uid] = Profile(data) }
  }

  /// Follow, or stop following. The pair is the document's name, as elsewhere.
  func toggleFollow(_ uid: String) async {
    guard let me = user?.uid, me != uid else { return }
    let ref = Firestore.firestore().document("follows/" + me + "_" + uid)
    if following.contains(uid) {
      try? await ref.delete()
    } else {
      try? await ref.setData(["from": me, "to": uid, "at": FieldValue.serverTimestamp()])
    }
  }

  /// Which way this account voted on a post, as far as the app has been told.
  /// A short somebody asked for from somewhere else — a shelf, a profile. The
  /// Shorts tab is where a short is watched, so asking for one goes there
  /// rather than opening a second, lesser player on top of wherever you were.
  /// People this account has blocked: neither of you sees the other on Codera.
  @Published var blocked: Set<String> = []

  @Published var openShort: String?


  @Published var myVotes: [String: Int] = [:]


  private func watchBlocks() {
    blocksListener?.remove()
    blocksListener = nil
    guard let me = user?.uid else { blocked = []; return }
    blocksListener = Firestore.firestore().collection("blocks")
      .whereField("from", isEqualTo: me)
      .addSnapshotListener { [weak self] snap, _ in
        Task { @MainActor in
          guard let self else { return }
          self.blocked = Set(snap?.documents.compactMap { $0.get("to") as? String } ?? [])
          self.sift()
        }
      }
  }

  /// The feed as it should read: without the people this account blocked.
  private func sift() {
    posts = everything.filter { !blocked.contains($0.uid) || $0.uid == user?.uid }
  }

  /**
   * Block somebody, or let them back.
   *
   * The id is fixed by the rules — yours, then theirs — which is what keeps it
   * to one record per pair rather than a pile of them.
   */
  func toggleBlock(_ uid: String) async {
    guard let me = user?.uid, uid != me else { return }
    let ref = Firestore.firestore().document("blocks/" + me + "_" + uid)
    if blocked.contains(uid) {
      try? await ref.delete()
    } else {
      try? await ref.setData(["from": me, "to": uid, "at": FieldValue.serverTimestamp()])
    }
  }

  /**
   * Say something is wrong with a post, a stream or a person.
   *
   * One per person per thing: the id is the two of them together, and the
   * rules refuse a create over an existing one. That refusal is the whole
   * mechanism — nothing counts how many times somebody pressed it.
   */
  func report(_ id: String, kind: Reported, reason: Reason) async throws {
    guard let me = user?.uid else { throw Blocked("Sign in to report.") }
    try await Firestore.firestore().document("reports/" + id + "_" + me).setData([
      "postId": id,
      "kind": kind.rawValue,
      "uid": me,
      "reason": reason.rawValue,
      "at": FieldValue.serverTimestamp(),
    ])
  }

  /// Whether a failed report failed because there is already one.
  nonisolated func alreadyReported(_ error: Error) -> Bool {
    (error as NSError).code == FirestoreErrorCode.permissionDenied.rawValue
  }

  /// Reads back the vote on one post, so a thumb shows what was already pressed.

  /**
   * What has been said under a post, oldest first, as it is being said.
   *
   * The thread is only open while it is being looked at, so this hands back the
   * listener for the sheet to let go of when it closes.
   */
  nonisolated func watchComments(on postId: String,
                                 _ onChange: @escaping ([Comment]) -> Void) -> ListenerRegistration {
    Firestore.firestore().collection("posts").document(postId).collection("comments")
      .order(by: "createdAt").limit(to: 200)
      .addSnapshotListener { snap, _ in
        let said = snap?.documents.map { Comment(id: $0.documentID, data: $0.data()) } ?? []
        Task { @MainActor in onChange(said) }
      }
  }

  /**
   * Say something under a post.
   *
   * The comment and the count move together, as the votes do: the rules accept
   * a counter that moved by one, and nothing else about the post.
   */
  func say(_ text: String, on post: Post) async throws {
    var said = try author()
    let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty else { return }
    if let problem = Safety.contactProblem(body, theirs: post.uid == user?.uid) {
      throw Blocked(problem)
    }
    said["text"] = String(body.prefix(1000))
    said["createdAt"] = FieldValue.serverTimestamp()

    let db = Firestore.firestore()
    try await db.collection("posts").document(post.id).collection("comments").addDocument(data: said)
    try? await db.collection("posts").document(post.id)
      .updateData(["commentCount": FieldValue.increment(Int64(1))])
  }

  /// Take one back down: your own anywhere, or anything under your own post.
  func unsay(_ comment: Comment, on post: Post) async {
    let db = Firestore.firestore()
    try? await db.collection("posts").document(post.id)
      .collection("comments").document(comment.id).delete()
    try? await db.collection("posts").document(post.id)
      .updateData(["commentCount": FieldValue.increment(Int64(-1))])
  }

  func loadVote(_ postId: String) async {
    guard let me = user?.uid else { return }
    let ref = Firestore.firestore().document("posts/" + postId + "/votes/" + me)
    let snap = try? await ref.getDocument()
    let v = (snap?.get("v") as? Int) ?? 0
    await MainActor.run { myVotes[postId] = v }
  }

  /**
   * A like or a dislike, the same shape the website and the Android app write.
   *
   * Pressing the one already pressed takes it back. The vote and the counter
   * move together in a transaction, because the rules only accept a counter
   * that moved by one and only from someone whose vote moved with it.
   */
  func vote(_ postId: String, _ want: Int) async {
    guard let me = user?.uid else { return }
    let db = Firestore.firestore()
    let mine = db.document("posts/" + postId + "/votes/" + me)
    let post = db.document("posts/" + postId)

    // Shown at once; the transaction below is the slow part.
    let had = myVotes[postId] ?? 0
    let now = had == want ? 0 : want
    await MainActor.run { myVotes[postId] = now }

    _ = try? await db.runTransaction { tx, _ -> Any? in
      var likes = 0
      var dislikes = 0
      if had == 1 { likes -= 1 }
      if had == -1 { dislikes -= 1 }
      if now == 1 { likes += 1 }
      if now == -1 { dislikes += 1 }

      if now == 0 { tx.deleteDocument(mine) } else {
        tx.setData(["v": now, "uid": me, "at": FieldValue.serverTimestamp()], forDocument: mine)
      }
      tx.updateData([
        "likeCount": FieldValue.increment(Int64(likes)),
        "dislikeCount": FieldValue.increment(Int64(dislikes)),
      ], forDocument: post)
      return nil
    }
  }

  func signIn(email: String, password: String) async throws {
    try await Auth.auth().signIn(withEmail: email, password: password)
  }

  func signUp(email: String, password: String) async throws {
    try await Auth.auth().createUser(withEmail: email, password: password)
  }

  // ---- making things -------------------------------------------------------

  /// Who a new post is signed by, as the other apps sign theirs.
  private func author() throws -> [String: Any] {
    guard let user = user else { throw Blocked("Sign in to post.") }
    return [
      "uid": user.uid,
      "authorName": username ?? user.displayName ?? (user.email?.components(separatedBy: "@").first ?? "Someone"),
      "authorPhoto": profiles[user.uid]?.photoUrl ?? user.photoURL?.absoluteString as Any,
    ]
  }

  struct Blocked: LocalizedError {
    let what: String
    init(_ what: String) { self.what = what }
    var errorDescription: String? { what }
  }

  func createPost(title: String, body: String, code: String, lang: String,
                  images: [Data]) async throws {
    var post = try author()
    // The pictures go up first: a post never points at a file that failed.
    if !images.isEmpty, let uid = user?.uid {
      var urls: [String] = []
      var paths: [String] = []
      for (n, image) in images.prefix(10).enumerated() {
        let path = "images/\(uid)/\(Int(Date().timeIntervalSince1970 * 1000))-\(n).jpg"
        let file = Storage.storage().reference(withPath: path)
        _ = try await file.putDataAsync(image, metadata: metadata("image/jpeg"))
        urls.append(try await file.downloadURL().absoluteString)
        paths.append(path)
      }
      // The first one is written on its own as well, so an app that predates
      // the list — an APK someone hasn't updated — shows a picture rather than
      // an empty post.
      post["imageUrl"] = urls.first
      post["imagePath"] = paths.first
      if urls.count > 1 {
        post["imageUrls"] = urls
        post["imagePaths"] = paths
      }
    }
    post["type"] = "post"
    post["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines)
    post["body"] = body.trimmingCharacters(in: .whitespacesAndNewlines)
    post["code"] = code.trimmingCharacters(in: .whitespacesAndNewlines)
    post["lang"] = code.trimmingCharacters(in: .whitespaces).isEmpty ? nil : lang
    post["likeCount"] = 0
    post["dislikeCount"] = 0
    post["commentCount"] = 0
    post["createdAt"] = FieldValue.serverTimestamp()
    _ = try await Firestore.firestore().collection("posts").addDocument(data: post)
  }

  /// A short or a video: the file goes up, then the post that points at it.
  func uploadVideo(url: URL, kind: String, title: String, about: String,
                   onProgress: @escaping (Double) -> Void) async throws {
    guard let uid = user?.uid else { throw Blocked("Sign in to post.") }
    let ext = url.pathExtension.isEmpty ? "mp4" : url.pathExtension
    let path = "videos/\(uid)/\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"
    let file = Storage.storage().reference(withPath: path)

    let task = file.putFile(from: url, metadata: metadata("video/\(ext == "mov" ? "quicktime" : ext)"))
    task.observe(.progress) { snapshot in
      guard let p = snapshot.progress, p.totalUnitCount > 0 else { return }
      Task { @MainActor in onProgress(Double(p.completedUnitCount) / Double(p.totalUnitCount)) }
    }
    _ = try await withCheckedThrowingContinuation { (go: CheckedContinuation<Void, Error>) in
      task.observe(.success) { _ in go.resume() }
      task.observe(.failure) { snapshot in go.resume(throwing: snapshot.error ?? Blocked("The upload stopped.")) }
    }

    var post = try author()
    post["type"] = kind
    post["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines)
    post["description"] = about.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      ? nil : about.trimmingCharacters(in: .whitespacesAndNewlines)
    post["videoUrl"] = try await file.downloadURL().absoluteString
    post["videoPath"] = path
    post["duration"] = try? await AVURLAsset(url: url).load(.duration).seconds
    post["likeCount"] = 0
    post["dislikeCount"] = 0
    post["commentCount"] = 0
    post["createdAt"] = FieldValue.serverTimestamp()
    _ = try await Firestore.firestore().collection("posts").addDocument(data: post)
  }

  // ---- your own page -------------------------------------------------------

  func setBio(_ bio: String) async throws {
    guard let uid = user?.uid else { throw Blocked("Sign in first.") }
    try await Firestore.firestore().document("profiles/\(uid)").setData([
      "bio": bio.trimmingCharacters(in: .whitespacesAndNewlines),
      "updatedAt": FieldValue.serverTimestamp(),
    ], merge: true)
    await reloadProfile(uid)
  }

  /// Your picture or your banner. Both live under `profile/{uid}` in Storage.
  func setProfileImage(_ data: Data, kind: String) async throws {
    guard let uid = user?.uid else { throw Blocked("Sign in first.") }
    let path = "profile/\(uid)/\(kind)-\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
    let file = Storage.storage().reference(withPath: path)
    _ = try await file.putDataAsync(data, metadata: metadata("image/jpeg"))
    let url = try await file.downloadURL().absoluteString
    try await Firestore.firestore().document("profiles/\(uid)").setData([
      kind == "banner" ? "bannerUrl" : "photoUrl": url,
      kind == "banner" ? "bannerPath" : "photoPath": path,
      "updatedAt": FieldValue.serverTimestamp(),
    ], merge: true)
    if kind != "banner" {
      let change = Auth.auth().currentUser?.createProfileChangeRequest()
      change?.photoURL = URL(string: url)
      try? await change?.commitChanges()
    }
    await reloadProfile(uid)
  }

  private func reloadProfile(_ uid: String) async {
    profiles[uid] = nil
    await loadProfile(uid)
  }

  private func metadata(_ type: String) -> StorageMetadata {
    let meta = StorageMetadata()
    meta.contentType = type
    return meta
  }

  /// The author's picture as it is *now*, not as it was when they posted.
  func photo(for post: Post) -> String? {
    profiles[post.uid]?.photoUrl ?? post.authorPhoto
  }

  /// Everyone in the feed, so their pictures and names are the current ones.
  func learnFaces() {
    for uid in Set(posts.prefix(60).map(\.uid)) where profiles[uid] == nil {
      Task { await loadProfile(uid) }
    }
  }

  func signOut() {
    try? Auth.auth().signOut()
    postsListener?.remove(); postsListener = nil
    posts = []
  }
}

/** "3h", "5d", or a date once it is old enough for the day to matter. */
/// 1200 as "1.2K", the way the website and the Android app shorten a count.
func compact(_ n: Int) -> String {
  if n < 1000 { return String(n) }
  if n < 1_000_000 {
    let thousands = Double(n) / 1000
    return thousands < 10
      ? String(format: "%.1fK", thousands).replacingOccurrences(of: ".0K", with: "K")
      : String(Int(thousands)) + "K"
  }
  let millions = Double(n) / 1_000_000
  return millions < 10
    ? String(format: "%.1fM", millions).replacingOccurrences(of: ".0M", with: "M")
    : String(Int(millions)) + "M"
}

func ago(_ date: Date?) -> String {
  guard let date else { return "" }
  let seconds = Date().timeIntervalSince(date)
  if seconds < 60 { return "just now" }
  if seconds < 3600 { return "\(Int(seconds / 60))m" }
  if seconds < 86_400 { return "\(Int(seconds / 3600))h" }
  if seconds < 604_800 { return "\(Int(seconds / 86_400))d" }
  return date.formatted(.dateTime.day().month().year(.twoDigits))
}
