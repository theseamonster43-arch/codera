import SwiftUI
import AVFoundation
#if canImport(UIKit)
import UIKit
#endif

/**
 * The tabs: Apple's own bar, nothing drawn by us.
 *
 * That means Liquid Glass along the bottom on an iPhone, the same bar at the
 * top of the window on an iPad (iPadOS 26 puts it there and offers no way
 * down), and the ornament down the left on a Vision Pro. Create sits in the
 * middle of the bar, except on a Vision Pro, where there is nothing to make yet.
 */
struct Shell: View {
  @State private var tab = 0
  @State private var previous = 0
  @State private var creating = false
#if !os(visionOS)
  @Environment(\.horizontalSizeClass) private var width
#endif

  /// A phone with a wide screen is a phone that has been unfolded, and there the
  /// tabs go down the side, as they do on an iPad's bigger relatives.
  private var unfolded: Bool {
#if os(iOS)
    UIDevice.current.userInterfaceIdiom == .phone && width == .regular
#else
    false
#endif
  }

  var body: some View {
    TabView(selection: $tab) {
      Tab(value: 0) {
        HomeView()
      } label: {
        Image(tab == 0 ? "homeFilled" : "home").renderingMode(.template).accessibilityLabel("Home")
      }

      Tab(value: 1) {
        ShortsView()
      } label: {
        Image(tab == 1 ? "shortsFilled" : "shorts").renderingMode(.template).accessibilityLabel("Shorts")
      }

#if !os(visionOS)
      Tab(value: 2) {
        Color.clear
      } label: {
        Image("plus").renderingMode(.template).accessibilityLabel("Create")
      }
#endif

      Tab(value: 3) {
        FollowingView()
      } label: {
        Image(tab == 3 ? "followedFilled" : "followed").renderingMode(.template).accessibilityLabel("Following")
      }

      Tab(value: 4) {
        YouView()
      } label: {
        Image(tab == 4 ? "youFilled" : "you").renderingMode(.template).accessibilityLabel("You")
      }
    }
    .onChange(of: tab) { old, new in
      // Create opens on top of wherever you were, rather than being a page.
      if new == 2 {
        creating = true
        tab = old == 2 ? previous : old
      } else {
        previous = new
      }
    }
    // Curved screens and windows — a Vision Pro's, an unfolded phone's — cut the
    // corners off anything that runs to the edge, so the content keeps clear of them.
#if os(visionOS)
    .safeAreaPadding(.horizontal, 20)
#else
    .safeAreaPadding(.horizontal, unfolded ? 14 : 0)
    .modifier(SideRail(on: unfolded))
    .background(BottomTabBar().frame(width: 0, height: 0))
    .sheet(isPresented: $creating) { CreateSheet() }
#endif
  }

}

#if os(iOS)
/**
 * Apple's tab bar, kept along the bottom on an iPad.
 *
 * iPadOS 26 hangs it from the top of the window when the window is wide. The
 * bar that goes at the bottom is the one iOS draws for a narrow window, so the
 * tab bar controller is told to lay itself out that way: it is still the
 * system's own Liquid Glass bar, only in its other place.
 */
struct BottomTabBar: UIViewRepresentable {
  func makeUIView(context: Context) -> UIView {
    let view = UIView()
    DispatchQueue.main.async { pin(from: view) }
    return view
  }

  func updateUIView(_ view: UIView, context: Context) {
    DispatchQueue.main.async { pin(from: view) }
  }

  private func pin(from view: UIView) {
    guard UIDevice.current.userInterfaceIdiom == .pad else { return }
    var responder: UIResponder? = view
    while let next = responder?.next {
      if let tabs = next as? UITabBarController {
        tabs.traitOverrides.horizontalSizeClass = .compact
        tabs.mode = .tabBar
        return
      }
      responder = next
    }
  }
}
#endif

#if !os(visionOS)
/**
 * The tabs down the side rather than along the bottom, which is what an
 * unfolded phone has the room for. Folded, it is the bar again, untouched.
 */
struct SideRail: ViewModifier {
  let on: Bool

  func body(content: Content) -> some View {
    if on {
      content.tabViewStyle(.sidebarAdaptable)
    } else {
      content
    }
  }
}
#endif

/** What Create makes. Each one opens the screen that makes it. */
struct CreateSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var making: String?

  var body: some View {
    NavigationStack {
      List {
        row("post", "Post", "Share a question, a snippet or a thought.", "code")
        row("short", "Short", "A tall video, under a minute.", "shorts")
        row("video", "Video", "A full tutorial.", "home")
        row("live", "Go live", "Stream to whoever is watching.", "followed")
      }
      .navigationTitle("Create")
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
    }
    .presentationDetents([.medium])
    .fullScreenCover(item: $making) { kind in
      switch kind {
      case "post": ComposePost()
      case "live": LiveStream()
      default: ComposeVideo(kind: kind)
      }
    }
  }

  private func row(_ kind: String, _ title: String, _ detail: String, _ icon: String) -> some View {
    Button {
      making = kind
    } label: {
      HStack(spacing: 12) {
        Image(icon).renderingMode(.template).foregroundStyle(Brand.blue).frame(width: 26)
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(Sans.bold(15)).foregroundStyle(.primary)
          Text(detail).font(Sans.regular(13)).foregroundStyle(.secondary)
        }
      }
      .padding(.vertical, 4)
    }
    .buttonStyle(.plain)
  }
}

extension String: @retroactive Identifiable { public var id: String { self } }

/**
 * A still from a video, drawn where the video will play.
 *
 * Posts carry no thumbnail of their own, so the first frame stands in for one;
 * each is worked out once and kept for as long as the app is running.
 */
@MainActor
final class Thumbnails {
  static let shared = Thumbnails()
  private var made: [String: Image] = [:]

  func make(for url: String) async -> Image? {
    if let there = made[url] { return there }
    guard let link = URL(string: url) else { return nil }
    let asset = AVURLAsset(url: link)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: 900, height: 900)
    guard let frame = try? await generator.image(at: CMTime(seconds: 0.2, preferredTimescale: 600)).image else {
      return nil
    }
    let image = Image(decorative: frame, scale: 1)
    made[url] = image
    return image
  }
}

struct VideoThumb: View {
  let url: String?
  @State private var frame: Image?

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 12).fill(.black)
      if let frame {
        frame.resizable().scaledToFill()
      }
      Image(systemName: "play.circle.fill")
        .font(.system(size: 42))
        .foregroundStyle(.white.opacity(0.92))
        .shadow(radius: 6)
    }
    .frame(height: 180)
    .clipped()
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .task {
      guard let url else { return }
      frame = await Thumbnails.shared.make(for: url)
    }
  }
}
