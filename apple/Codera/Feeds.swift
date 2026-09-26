import SwiftUI
import AVKit

/**
 * Shorts: one tall video at a time, the next a swipe away.
 *
 * Only the one on screen plays; the others hold their first frame, so scrolling
 * through never has more than one video running.
 */
struct ShortsView: View {
  @EnvironmentObject var store: Store
  @State private var showing: String?

  var body: some View {
    GeometryReader { geo in
      if store.shorts.isEmpty {
        ContentUnavailableView("No shorts yet", image: "shorts",
                               description: Text("Short videos posted from any Codera app show up here."))
          .frame(width: geo.size.width, height: geo.size.height)
      } else {
        ScrollView(.vertical) {
          LazyVStack(spacing: 0) {
            ForEach(store.shorts) { short in
              ShortPage(post: short, playing: showing == short.id)
                .frame(width: geo.size.width, height: geo.size.height)
                .id(short.id)
            }
          }
          .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $showing)
        // The black runs to the edges, but the pages are measured and laid out
        // inside the bars. Letting the scroll itself ignore the safe area made
        // every page shorter than the screen it scrolled in, so each short sat
        // high and the bar underneath it floated in the middle of nothing.
        .background(Color.black.ignoresSafeArea())
        .onAppear { showing = store.shorts.first?.id }
      }
    }
  }
}

private struct ShortPage: View {
  let post: Post
  let playing: Bool
  @EnvironmentObject var store: Store

  @State private var player: AVPlayer?
  @State private var paused = false
  @State private var at = 0.0            // seconds played
  @State private var length = 0.0        // seconds long
  @State private var scrubbing = false
  @State private var cheered = false     // the heart a double tap throws up
  @State private var ticker: Any?
  @State private var talking = false   // the comments, over the short

  private var mine: Int { store.myVotes[post.id] ?? 0 }

  var body: some View {
    // Centred. The overlay pins itself to the bottom rather than the whole
    // stack leaning that way — aligning the stack pushed the video into the
    // corner with it, which is why a short sat low and left.
    ZStack {
      Color.black

      if let player {
        // A short is a tall picture: it keeps its shape in a wide window
        // rather than being cropped to fit the width.
        VideoPlayer(player: player)
          .aspectRatio(9 / 16, contentMode: .fit)
          .allowsHitTesting(false)
      }

      // One surface for both taps, over the whole page: one to hold it, two to
      // like it. A tap that lands on the video's own controls never reaches us,
      // which is why the player is left out of the hit testing above.
      Color.clear
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { cheer() }
        .onTapGesture { holdOrPlay() }

      if paused {
        Image(systemName: "play.fill")
          .font(.system(size: 52))
          .foregroundStyle(.white.opacity(0.92))
          .shadow(radius: 12)
          .allowsHitTesting(false)
          .transition(.opacity)
      }

      if cheered {
        Image(systemName: "hand.thumbsup.fill")
          .font(.system(size: 92))
          .foregroundStyle(Brand.blue)
          .shadow(radius: 18)
          .scaleEffect(cheered ? 1 : 0.4)
          .allowsHitTesting(false)
      }

      // What was said about it, along the bottom where it belongs.
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 8) {
          Avatar(url: store.photo(for: post), size: 30)
          Text(post.authorName).font(Sans.bold(14.5)).foregroundStyle(.white)
          if post.uid != store.user?.uid {
            FollowButton(uid: post.uid).scaleEffect(0.85)
          }
          Spacer(minLength: 0)
        }
        Text(post.title)
          .font(Sans.bold(16))
          .foregroundStyle(.white)
          .lineLimit(2)
        Text(ago(post.createdAt))
          .font(Sans.medium(12))
          .foregroundStyle(.white.opacity(0.65))
      }
      .padding(.horizontal, 18)
      .padding(.bottom, 26)
      .shadow(radius: 10)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
      .frame(maxWidth: 520)

      // Like, dislike and the comment count, up the right-hand edge.
      VStack(spacing: 20) {
        tally("hand.thumbsup", post.likeCount + (mine == 1 ? 1 : 0), on: mine == 1) {
          Task { await store.vote(post.id, 1) }
        }
        tally("hand.thumbsdown", post.dislikeCount + (mine == -1 ? 1 : 0), on: mine == -1) {
          Task { await store.vote(post.id, -1) }
        }
        tally("bubble.right", post.commentCount, on: false) { talking = true }
      }
      .padding(.trailing, 14)
      .padding(.bottom, 120)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)

      // The only control a short needs: how far through it is, and a way to
      // move. Thin until it is touched, so it stays out of the picture.
      VStack {
        Spacer()
        Scrubber(at: $at, length: length, scrubbing: $scrubbing) { seconds in
          player?.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
        }
      }
      .padding(.bottom, 4)
    }
    .task(id: post.id) { await store.loadVote(post.id) }
    .sheet(isPresented: $talking) { CommentSheet(post: post) }
#if DEBUG
    // -openComments 1 opens the thread over the short being watched, which is
    // how it gets looked at on a simulator with no way to tap.
    .task(id: playing) {
      if playing, UserDefaults.standard.bool(forKey: "openComments") { talking = true }
    }
#endif
    .onAppear { begin() }
    .onChange(of: playing, initial: true) { _, isPlaying in
      guard let player else { return }
      if isPlaying && !paused { player.play() } else { player.pause() }
    }
    .onDisappear {
      player?.pause()
      if let ticker { player?.removeTimeObserver(ticker) }
      ticker = nil
    }
  }

  /// A thumb or a bubble with its count under it.
  private func tally(_ glyph: String, _ count: Int, on: Bool, _ press: @escaping () -> Void) -> some View {
    Button(action: press) {
      VStack(spacing: 5) {
        Image(systemName: on ? glyph + ".fill" : glyph)
          .font(.system(size: 25, weight: .medium))
          .foregroundStyle(on ? Brand.blue : .white)
        Text(compact(count))
          .font(Sans.semibold(12.5))
          .foregroundStyle(.white)
      }
      .shadow(radius: 8)
      .frame(width: 54)
    }
    .buttonStyle(.plain)
  }

  private func holdOrPlay() {
    guard let player else { return }
    paused.toggle()
    withAnimation(.easeOut(duration: 0.15)) { }
    paused ? player.pause() : player.play()
  }

  /// Two taps means a like — and never an unlike, which is not what a double
  /// tap ever means.
  private func cheer() {
    if mine != 1 { Task { await store.vote(post.id, 1) } }
    withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { cheered = true }
    Task {
      try? await Task.sleep(for: .milliseconds(650))
      withAnimation(.easeOut(duration: 0.25)) { cheered = false }
    }
  }

  private func begin() {
    guard player == nil, let url = post.videoUrl.flatMap(URL.init(string:)) else { return }
    let made = AVPlayer(url: url)
    made.actionAtItemEnd = .none
    NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime,
                                           object: made.currentItem, queue: .main) { _ in
      made.seek(to: .zero)
      made.play()
    }
    // Ten times a second is enough for a bar and cheap enough to leave running.
    ticker = made.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.1, preferredTimescale: 600), queue: .main
    ) { time in
      if !scrubbing { at = time.seconds }
      if let item = made.currentItem, item.duration.isNumeric {
        length = item.duration.seconds
      }
    }
    player = made
  }
}

/**
 * How far through a short is, and a way to move within it.
 *
 * A hairline while it plays, thickening under a finger — a short is something
 * watched rather than operated, and a full set of transport controls over the
 * picture would be in the way of the thing itself.
 */
private struct Scrubber: View {
  @Binding var at: Double
  let length: Double
  @Binding var scrubbing: Bool
  let seek: (Double) -> Void

  var body: some View {
    GeometryReader { geo in
      let width = geo.size.width
      let through = length > 0 ? min(max(at / length, 0), 1) : 0

      ZStack(alignment: .leading) {
        Capsule().fill(.white.opacity(0.22))
        Capsule().fill(.white).frame(width: width * through)
      }
      .frame(height: scrubbing ? 7 : 3)
      .frame(maxHeight: .infinity, alignment: .center)
      .animation(.easeOut(duration: 0.12), value: scrubbing)
      .contentShape(Rectangle())
      .gesture(
        DragGesture(minimumDistance: 0)
          .onChanged { touch in
            guard length > 0 else { return }
            scrubbing = true
            at = min(max(touch.location.x / width, 0), 1) * length
          }
          .onEnded { _ in
            scrubbing = false
            seek(at)
          }
      )
    }
    .frame(height: 26)
    .padding(.horizontal, 12)
  }
}

/**
 * Following: the people you follow along the top, and their newest below.
 */
struct FollowingView: View {
  @EnvironmentObject var store: Store

  private let columns = [GridItem(.adaptive(minimum: 320, maximum: 520), spacing: 14, alignment: .top)]

  private var people: [Post] {
    // One post per person, newest first, just to have a face and a name.
    var seen = Set<String>()
    return store.posts.filter { store.following.contains($0.uid) && seen.insert($0.uid).inserted }
  }

  var body: some View {
    NavigationStack {
      ScrollView {
      // The page says what it is, on every device. A Vision Pro and an unfolded
      // phone put the tabs down the side, where the name of the page is not on
      // screen at all unless the page says it.
      FollowingHeader().padding(.top, 8)

      if store.following.isEmpty {
        ContentUnavailableView("Not following anyone yet", image: "followed",
                               description: Text("Open someone's name on a post and press Follow. Their new posts land here."))
          .padding(.top, 60)
      } else {
        VStack(alignment: .leading, spacing: 14) {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
              ForEach(people) { person in
                NavigationLink(value: person.uid) {
                  VStack(spacing: 6) {
                    Avatar(url: store.photo(for: person), size: 58)
                    Text(person.authorName).font(Sans.semibold(12)).lineLimit(1).frame(width: 70)
                  }
                }
                .buttonStyle(.plain)
              }
            }
            .padding(.horizontal, 16)
          }

          Text("Latest from people you follow")
            .font(Sans.bold(17))
            .padding(.horizontal, 16)

          if store.followed.isEmpty {
            Text("When they post something, it shows up here.")
              .font(Sans.regular(14)).foregroundStyle(Brand.muted)
              .padding(.horizontal, 16)
          } else {
            LazyVGrid(columns: columns, spacing: 14) {
              ForEach(store.followed) { PostCard(post: $0) }
            }
            .padding(.horizontal, 14)
          }
        }
        .padding(.top, 12)
        .frame(maxWidth: Brand.readable)
        .frame(maxWidth: .infinity)
      }
      }
      .navigationDestination(for: String.self) { ProfileView(uid: $0) }
    }
  }
}


/** The heading on Following, drawn the way Home draws its own. */
struct FollowingHeader: View {
  var body: some View {
    HStack(spacing: 10) {
      Image("followedFilled").renderingMode(.template)
        .resizable().scaledToFit()
        .frame(width: 22, height: 22)
        .foregroundStyle(Brand.blue)
      Text("Following").font(Sans.heavy(19))
      Spacer()
    }
    .padding(.horizontal, 16)
    .padding(.bottom, 12)
  }
}
