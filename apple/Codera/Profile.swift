import SwiftUI

/**
 * Somebody's page: their banner and picture, what they post about, and
 * everything they have posted, filtered by kind — the same page the website
 * and the Android app show, reached by opening a name anywhere in the app.
 */
struct ProfileView: View {
  let uid: String
  var isMe: Bool = false

  @EnvironmentObject var store: Store
  @State private var filter = "all"
  @State private var editing = false

  private let columns = [GridItem(.adaptive(minimum: 320, maximum: 520), spacing: 14, alignment: .top)]

  private var profile: Profile? { store.profiles[uid] }
  private var mine: [Post] { store.posts.filter { $0.uid == uid } }
  private var shown: [Post] { filter == "all" ? mine : mine.filter { $0.type == filter } }
  private var likes: Int { mine.reduce(0) { $0 + $1.likeCount } }

  private var name: String {
    profile?.username ?? mine.first?.authorName ?? "Codera"
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        banner

        HStack(alignment: .bottom, spacing: 12) {
          Avatar(url: profile?.photoUrl ?? mine.first?.authorPhoto, size: 84)
            .overlay(Circle().stroke(.background, lineWidth: 4))
            .padding(.leading, 4)

          VStack(alignment: .leading, spacing: 3) {
            Text(name).font(Sans.heavy(24))
            Text("@\(name) · \(mine.count) \(mine.count == 1 ? "post" : "posts") · \(likes) \(likes == 1 ? "like" : "likes")")
              .font(Sans.medium(13))
              .foregroundStyle(Brand.muted)
          }
          .padding(.bottom, 6)

          Spacer()
        }
        .padding(.top, -34)
        .padding(.horizontal, 16)

        if let bio = profile?.bio, !bio.isEmpty {
          Text(bio).font(Sans.regular(14.5)).padding(.horizontal, 18).padding(.top, 12)
        }

        if isMe {
          Button("Edit page") { editing = true }
            .buttonStyle(PillButton())
            .padding(.horizontal, 18).padding(.top, 14)
        } else {
          FollowButton(uid: uid).padding(.horizontal, 18).padding(.top, 14)
        }

        chips

        if shown.isEmpty {
          Text(mine.isEmpty ? "Nothing here yet." : "Nothing of that kind yet.")
            .font(Sans.regular(14)).foregroundStyle(Brand.muted)
            .padding(.horizontal, 18).padding(.top, 20)
        } else {
          LazyVGrid(columns: columns, spacing: 14) {
            ForEach(shown) { FeedCard(post: $0) }
          }
          .padding(.horizontal, 14)
        }

        if isMe {
          Button("Sign out") { store.signOut() }
            .buttonStyle(PillButton())
            .tint(Brand.red)
            .padding(.horizontal, 18)
            .padding(.vertical, 26)
            .frame(maxWidth: .infinity, alignment: .center)
        }
      }
      .frame(maxWidth: Brand.readable)
      .frame(maxWidth: .infinity)
    }
    .task { await store.loadProfile(uid) }
#if !os(visionOS)
    .sheet(isPresented: $editing) { EditProfile() }
#endif
  }

  private var banner: some View {
    Group {
      if let url = profile?.bannerUrl.flatMap(URL.init(string:)) {
        AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Brand.mark.opacity(0.35) }
      } else {
        Brand.mark.opacity(0.35)
      }
    }
    .frame(height: 132)
    .frame(maxWidth: .infinity)
    .clipped()
    .clipShape(RoundedRectangle(cornerRadius: 16))
    .padding(.horizontal, 14)
    .padding(.top, 8)
  }

  private var chips: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 9) {
        chip("All", "all", mine.count)
        chip("Posts", "post", mine.filter { $0.type == "post" }.count)
        chip("Shorts", "short", mine.filter { $0.type == "short" }.count)
        chip("Videos", "video", mine.filter { $0.type == "video" || $0.type == "live" }.count)
      }
      .padding(.horizontal, 18)
    }
    .padding(.vertical, 16)
  }

  private func chip(_ label: String, _ kind: String, _ count: Int) -> some View {
    Button {
      filter = kind
    } label: {
      HStack(spacing: 5) {
        Text(label).font(Sans.bold(13.5))
        Text("\(count)").font(Sans.semibold(13)).foregroundStyle(filter == kind ? .white.opacity(0.7) : .secondary)
      }
      .padding(.horizontal, 14)
      .frame(height: 34)
      .background(filter == kind ? AnyShapeStyle(Color.primary) : AnyShapeStyle(Brand.bg2), in: Capsule())
      .foregroundStyle(filter == kind ? AnyShapeStyle(Color(uiColor: .systemBackground)) : AnyShapeStyle(Color.primary))
      .overlay(Capsule().stroke(.separator, lineWidth: filter == kind ? 0 : 0.5))
    }
    .buttonStyle(.plain)
  }
}

/** Follow, or stop following, the person whose page this is. */
struct FollowButton: View {
  let uid: String
  @EnvironmentObject var store: Store

  private var following: Bool { store.following.contains(uid) }

  var body: some View {
    Button {
      Task { await store.toggleFollow(uid) }
    } label: {
      Text(following ? "Following" : "Follow")
        .font(Sans.bold(14))
        .padding(.horizontal, 20)
        .frame(height: 38)
        .background(following ? AnyShapeStyle(Brand.bg2) : AnyShapeStyle(Brand.mark), in: Capsule())
        .foregroundStyle(following ? AnyShapeStyle(Color.primary) : AnyShapeStyle(Color.white))
        .overlay(Capsule().stroke(.separator, lineWidth: following ? 0.5 : 0))
    }
    .buttonStyle(.plain)
  }
}
