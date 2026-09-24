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
  /// What Create was asked for, once its sheet has closed out of the way.
  @State private var making: String?
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

  /// An icon on the bar; an icon and its name in the side rail, where a row
  /// with nothing written in it reads as an empty line.
  @ViewBuilder
  private func label(_ name: String, _ icon: String, filled: Bool) -> some View {
    let art = Image(filled ? icon + "Filled" : icon).renderingMode(.template)
#if os(visionOS)
    Label { Text(name) } icon: { art }
#else
    if unfolded {
      Label { Text(name) } icon: { art }
    } else {
      art.accessibilityLabel(name)
    }
#endif
  }

  var body: some View {
    TabView(selection: $tab) {
      Tab(value: 0) {
        HomeView()
      } label: {
        label("Home", "home", filled: tab == 0)
      }

      Tab(value: 1) {
        ShortsView()
      } label: {
        label("Shorts", "shorts", filled: tab == 1)
      }

#if !os(visionOS)
      Tab(value: 2) {
        Color.clear
      } label: {
#if os(visionOS)
        Label { Text("Create") } icon: { Image("plus").renderingMode(.template) }
#else
        if unfolded {
          Label { Text("Create") } icon: { Image("plus").renderingMode(.template) }
        } else {
          Image("plus").renderingMode(.template).accessibilityLabel("Create")
        }
#endif
      }
#endif

      Tab(value: 3) {
        FollowingView()
      } label: {
        label("Following", "followed", filled: tab == 3)
      }

      Tab(value: 4) {
        YouView()
      } label: {
        label("You", "you", filled: tab == 4)
      }
    }
#if DEBUG
    // Launching with -openCompose post (or short, video, live) opens that
    // composer straight away, which is how the shell-presents-the-composer
    // path gets checked on a simulator with no way to tap.
    .task {
      if let kind = UserDefaults.standard.string(forKey: "openCompose") { making = kind }
    }
#endif
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
    // A Vision Pro window is rounded hard enough to take a bite out of a corner
    // in both directions, so both are kept clear.
    .safeAreaPadding(.horizontal, 22)
    .safeAreaPadding(.vertical, 16)
#else
    .safeAreaPadding(.horizontal, unfolded ? 16 : 0)
    .safeAreaPadding(.vertical, unfolded ? 10 : 0)
    .modifier(SideRail(on: unfolded))
    .modifier(BarAtTheBottom())
    .sheet(isPresented: $creating) { CreateSheet(pick: { kind in making = kind }) }
    // Raised by the shell, not by the sheet: a sheet cannot open a full-screen
    // cover while it is itself on screen, which is why these did nothing.
    .fullScreenCover(item: $making) { kind in
      switch kind {
      case "post": ComposePost()
      case "live": LiveStream()
      default: ComposeVideo(kind: kind)
      }
    }
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
 * The bar along the bottom on an iPad.
 *
 * iPadOS 26 floats its tab bar at the top of the window. Asking the tab bar
 * controller to lay itself out compactly drew a second bar underneath and left
 * the first where it was, so this asks for the style instead: one bar, and the
 * one that belongs at the bottom.
 */
struct BarAtTheBottom: ViewModifier {
  func body(content: Content) -> some View {
    content.tabViewStyle(.tabBarOnly)
  }
}

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
  /// Told what was chosen. The shell opens it once this sheet has closed.
  let pick: (String) -> Void
  @Environment(\.dismiss) private var dismiss

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
  }

  private func row(_ kind: String, _ title: String, _ detail: String, _ icon: String) -> some View {
    Button {
      // Closed first, then opened: the two cannot be on screen at once.
      dismiss()
      pick(kind)
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
