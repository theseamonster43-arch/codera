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
        .ignoresSafeArea()
        .background(.black)
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

  var body: some View {
    ZStack(alignment: .bottomLeading) {
      Color.black

      if let player {
        // A short is a tall picture: it keeps its shape in a wide window rather
        // than being cropped to the width.
        VideoPlayer(player: player)
          .aspectRatio(9 / 16, contentMode: .fit)
          .allowsHitTesting(false)
      }

      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: 8) {
          Avatar(url: store.photo(for: post), size: 28)
          Text(post.authorName).font(Sans.bold(14)).foregroundStyle(.white)
          Text("· \(ago(post.createdAt))").font(Sans.medium(12.5)).foregroundStyle(.white.opacity(0.7))
        }
        Text(post.title).font(Sans.bold(16)).foregroundStyle(.white).lineLimit(3)
      }
      .padding(20)
      .padding(.bottom, 40)
      .shadow(radius: 8)
    }
    .onAppear {
      guard player == nil, let url = post.videoUrl.flatMap(URL.init(string:)) else { return }
      let made = AVPlayer(url: url)
      made.actionAtItemEnd = .none
      NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime,
                                             object: made.currentItem, queue: .main) { _ in
        made.seek(to: .zero)
        made.play()
      }
      player = made
    }
    .onChange(of: playing, initial: true) { _, isPlaying in
      isPlaying ? player?.play() : player?.pause()
    }
    .onDisappear { player?.pause() }
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
              .font(Sans.regular(14)).foregroundStyle(.secondary)
              .padding(.horizontal, 16)
          } else {
            LazyVGrid(columns: columns, spacing: 14) {
              ForEach(store.followed) { PostCard(post: $0) }
            }
            .padding(.horizontal, 14)
          }
        }
        .padding(.top, 12)
        .frame(maxWidth: 1180)
        .frame(maxWidth: .infinity)
      }
      }
      .navigationDestination(for: String.self) { ProfileView(uid: $0) }
    }
  }
}
