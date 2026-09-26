import SwiftUI
import AVFoundation

/** Which video a card was asked to open. */
struct Watching: Hashable {
  let post: Post
}

/**
 * Watching one video.
 *
 * What a card promises when it is drawn as a video: the thing plays, with the
 * title, whose it is, and the same like, dislike and comment the rest of Codera
 * has. A short plays in its own shape rather than being stretched to a wide box.
 */
struct WatchPage: View {
  let post: Post
  @EnvironmentObject var store: Store

  @State private var player: AVPlayer?
  @State private var talking = false
  @State private var full = false
  @State private var reporting = false

  private var mine: Int { store.myVotes[post.id] ?? 0 }
  private var tall: Bool { post.type == "short" }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        // The shape decides the size and the player is laid over it, for the
        // same reason the thumbnails do it that way.
        Color.black
          .aspectRatio(tall ? 9.0 / 16.0 : 16.0 / 9.0, contentMode: .fit)
          .frame(maxWidth: .infinity)
          .overlay {
            if let player {
              CoderaPlayer(player: player, full: false, onFull: { full = true })
            }
          }
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

        Text(post.title).font(Sans.bold(19)).foregroundStyle(Brand.text)

        HStack(spacing: 10) {
          NavigationLink(value: post.uid) {
            HStack(spacing: 9) {
              Avatar(url: store.photo(for: post), size: 36)
              VStack(alignment: .leading, spacing: 1) {
                Text(post.authorName).font(Sans.bold(14.5)).foregroundStyle(Brand.text)
                Text(ago(post.createdAt)).font(Sans.medium(12.5)).foregroundStyle(Brand.muted)
              }
            }
          }
          .buttonStyle(Tappable())
          Spacer(minLength: 8)
          if post.uid != store.user?.uid {
            FollowButton(uid: post.uid)
          }
        }

        HStack(spacing: 10) {
          count(Ink.up, post.likeCount + (mine == 1 ? 1 : 0), on: mine == 1) {
            Task { await store.vote(post.id, 1) }
          }
          count(Ink.up, post.dislikeCount + (mine == -1 ? 1 : 0), on: mine == -1,
                over: true) {
            Task { await store.vote(post.id, -1) }
          }
          count(Ink.comment, post.commentCount, on: false) { talking = true }
          Spacer(minLength: 0)
          if post.uid != store.user?.uid {
            Button { reporting = true } label: {
              Image(systemName: "flag")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.muted)
                .frame(width: 38, height: 38)
                .background(Brand.bg2, in: Circle())
                .overlay(Circle().stroke(Brand.line, lineWidth: 1))
            }
            .buttonStyle(Tappable())
          }
        }

        CommentThread(post: post)

        if let words = post.body, !words.isEmpty {
          Text(words)
            .font(Sans.regular(14.5))
            .foregroundStyle(Brand.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Brand.bg2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
      }
      .padding(14)
      .frame(maxWidth: Brand.readable)
      .frame(maxWidth: .infinity)
    }
    .background(Brand.bg)
    .navigationTitle("")
#if !os(visionOS)
    .navigationBarTitleDisplayMode(.inline)
#endif
    .sheet(isPresented: $talking) { CommentSheet(post: post) }
    .sheet(isPresented: $reporting) { ReportSheet(id: post.id, kind: .post) }
    // Full screen means the whole screen: the picture takes as much of it as
    // its shape allows rather than keeping the box it had on the page.
    .fullScreenCover(isPresented: $full) {
      ZStack {
        Color.black
        if let player {
          CoderaPlayer(player: player, full: true, onFull: { full = false })
        }
      }
      .ignoresSafeArea()
    }
    .task(id: post.id) { await store.loadVote(post.id) }
    .onAppear {
      guard player == nil, let url = post.videoUrl.flatMap(URL.init(string:)) else { return }
      player = AVPlayer(url: url)
    }
    .onDisappear { if !full { player?.pause() } }
  }

  private func count(_ glyph: String, _ n: Int, on: Bool, over: Bool = false,
                     _ press: @escaping () -> Void) -> some View {
    Button(action: press) {
      HStack(spacing: 6) {
        Glyph(path: glyph, filled: on, weight: 1.7, size: 19)
          .rotationEffect(.degrees(over ? 180 : 0))
        Text(compact(n)).font(Sans.semibold(14))
      }
      .foregroundStyle(on ? Brand.blue : Brand.text)
      .scaleEffect(on ? 1.05 : 1)
      .animation(.spring(response: 0.3, dampingFraction: 0.5), value: on)
      .padding(.horizontal, 14)
      .frame(height: 38)
      .background(Brand.bg2, in: Capsule())
      .overlay(Capsule().stroke(Brand.line, lineWidth: 1))
    }
    .buttonStyle(Tappable())
  }
}
