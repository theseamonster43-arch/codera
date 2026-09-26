import SwiftUI

/**
 * What a post looks like in a feed.
 *
 * A video is not a post with a video in it — it is a thumbnail with a title
 * under it, the shape every video anywhere has. A short is the same shape stood
 * on its end. Only something written keeps the post card, where the words are
 * the thing and a picture is an attachment.
 */
struct FeedCard: View {
  let post: Post

  var body: some View {
    if post.hasVideo {
      VideoCard(post: post)
    } else {
      PostCard(post: post)
    }
  }
}

/** A video or a short: the picture first, and who made it underneath. */
struct VideoCard: View {
  let post: Post
  /// Narrow, for the shelf, where a full-sized body would crowd the picture.
  var small = false
  @EnvironmentObject var store: Store

  private var tall: Bool { post.type == "short" }

  var body: some View {
    if tall {
      // A short is watched in the Shorts tab, swiping on from there.
      Button { store.openShort = post.id } label: { card }
        .buttonStyle(Tappable(scale: 0.975))
        .safety(on: post)
    } else {
      NavigationLink(value: Watching(post: post)) { card }
        .buttonStyle(Tappable(scale: 0.975))
        .safety(on: post)
    }
  }

  private var card: some View {
    VStack(alignment: .leading, spacing: 0) {
        VideoThumb(post: post, tall: tall)

        HStack(alignment: .top, spacing: 10) {
          Avatar(url: store.photo(for: post), size: small ? 26 : 34)
          VStack(alignment: .leading, spacing: 2) {
            Text(post.title)
              .font(Sans.bold(small ? 13 : 15))
              .foregroundStyle(Brand.text)
              .lineLimit(2)
              .multilineTextAlignment(.leading)
            Text(post.authorName)
              .font(Sans.medium(small ? 11.5 : 13))
              .foregroundStyle(Brand.muted)
              .lineLimit(1)
            Text("\(plural(post.likeCount, "like")) · \(ago(post.createdAt))")
              .font(Sans.medium(small ? 11.5 : 13))
              .foregroundStyle(Brand.muted)
          }
          Spacer(minLength: 0)
        }
        .padding(small ? 9 : 12)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Brand.bg2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Brand.line, lineWidth: 1)
      )
  }
}

/**
 * The still a video shows before it is played, with what it is written on it.
 *
 * A short says so in the corner; anything else says how long it runs. Nothing
 * is stored for this — the first frame is pulled out of the file itself.
 */
struct VideoThumb: View {
  let post: Post
  var tall = false
  @State private var frame: Image?

  var body: some View {
    // The shape is what decides the size, and the picture is laid over it. A
    // stack with the picture inside takes its ratio from the picture's own
    // size instead of the card's width, which drew one frame a page tall.
    Color.black
      .aspectRatio(tall ? 9.0 / 16.0 : 16.0 / 9.0, contentMode: .fit)
      .frame(maxWidth: .infinity)
      .overlay {
        if let frame {
          frame.resizable().scaledToFill()
        } else {
          Glyph(path: Ink.play, filled: true, weight: 1, size: 34)
            .foregroundStyle(.white.opacity(0.35))
        }
      }
      .clipShape(
        UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 0,
                               bottomTrailingRadius: 0, topTrailingRadius: 16,
                               style: .continuous)
      )
    .overlay(alignment: .bottomLeading) {
      if post.type == "short" {
        Tag("SHORT", on: Brand.green, text: .black)
      } else if post.type == "live" {
        Tag("STREAM", on: Brand.red, text: .white)
      }
    }
    .overlay(alignment: .bottomTrailing) {
      if post.type != "short", let length = post.duration, length > 0 {
        Tag(clock(length), on: .black.opacity(0.78), text: .white)
      }
    }
    .task(id: post.videoUrl) {
      guard let url = post.videoUrl else { return }
      frame = await Thumbnails.shared.make(for: url)
    }
  }
}

/** The small hard-edged label in a thumbnail's corner. */
private struct Tag<Background: ShapeStyle>: View {
  let words: String
  let on: Background
  let text: Color

  init(_ words: String, on: Background, text: Color) {
    self.words = words
    self.on = on
    self.text = text
  }

  var body: some View {
    Text(words)
      .font(Sans.heavy(11))
      .foregroundStyle(text)
      .padding(.horizontal, 7)
      .padding(.vertical, 3)
      .background(on, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
      .padding(8)
  }
}

/** "0:14", "1:02:30" — a length the way a player writes it. */
func clock(_ seconds: Double) -> String {
  let whole = Int(seconds.rounded())
  let s = whole % 60, m = (whole / 60) % 60, h = whole / 3600
  return h > 0
    ? String(format: "%d:%02d:%02d", h, m, s)
    : String(format: "%d:%02d", m, s)
}

/** "1 like", "12 likes" — counted properly rather than "1 likes". */
func plural(_ n: Int, _ word: String) -> String {
  "\(n) \(word)\(n == 1 ? "" : "s")"
}

/**
 * The pictures on a post, swiped through when there is more than one.
 *
 * A single picture is just a picture — no dots, nothing to swipe. Several get
 * a page each and a row of dots, so it reads at a glance as more than one
 * rather than a picture that happens to move.
 */
struct Gallery: View {
  let urls: [String]
  @State private var at = 0

  var body: some View {
    if urls.count == 1 {
      picture(urls[0])
    } else {
      VStack(spacing: 8) {
        TabView(selection: $at) {
          ForEach(Array(urls.enumerated()), id: \.offset) { i, url in
            picture(url).tag(i)
          }
        }
#if !os(visionOS)
        .tabViewStyle(.page(indexDisplayMode: .never))
#endif
        .frame(height: 220)

        HStack(spacing: 6) {
          ForEach(urls.indices, id: \.self) { i in
            Circle()
              .fill(i == at ? Brand.text : Brand.muted.opacity(0.4))
              .frame(width: 6, height: 6)
          }
        }
        .animation(.easeOut(duration: 0.15), value: at)
      }
    }
  }

  private func picture(_ url: String) -> some View {
    AsyncImage(url: URL(string: url)) { image in
      image.resizable().scaledToFill()
    } placeholder: {
      Brand.bg3
    }
    .frame(maxWidth: .infinity)
    .frame(height: urls.count == 1 ? 180 : 220)
    .clipped()
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

/**
 * The row of shorts across the top of the feed.
 *
 * Narrow cards, side by side, scrolled sideways — the same shelf the website
 * puts there. A short is a tall picture, and a column of them would be one
 * short per screen; along a shelf, a dozen are in reach at once.
 */
struct ShortsShelf: View {
  let shorts: [Post]

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Image("shorts").renderingMode(.template)
          .resizable().scaledToFit()
          .frame(width: 17, height: 17)
        Text("Shorts").font(Sans.bold(17))
      }
      .foregroundStyle(Brand.text)
      .padding(.horizontal, 14)

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: 12) {
          ForEach(shorts) { short in
            VideoCard(post: short, small: true).frame(width: 150)
          }
        }
        .padding(.horizontal, 14)
        .scrollTargetLayout()
      }
      .scrollTargetBehavior(.viewAligned)
    }
  }
}
