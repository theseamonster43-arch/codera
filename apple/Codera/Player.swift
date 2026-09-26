import SwiftUI
import AVFoundation

/**
 * The picture, and nothing else.
 *
 * A layer with the video on it and no controls of its own — AVKit's player
 * brings Apple's whole transport bar with it, in Apple's font, and it is the
 * one part of a Codera screen nothing could be done about. Everything drawn
 * over this is ours.
 */
struct PlayerSurface: UIViewRepresentable {
  let player: AVPlayer
  var fills = false

  func makeUIView(context: Context) -> Surface {
    let view = Surface()
    view.backgroundColor = .black
    view.layer.player = player
    view.layer.videoGravity = fills ? .resizeAspectFill : .resizeAspect
    return view
  }

  func updateUIView(_ view: Surface, context: Context) {
    if view.layer.player !== player { view.layer.player = player }
    view.layer.videoGravity = fills ? .resizeAspectFill : .resizeAspect
  }

  final class Surface: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    override var layer: AVPlayerLayer { super.layer as! AVPlayerLayer }
  }
}

/**
 * Codera's video player.
 *
 * One bar along the bottom: play, where you are, how long it runs, and a line
 * to drag. It shows itself when the picture is touched and gets out of the way
 * again a few seconds later, because what somebody came for is the video.
 */
struct CoderaPlayer: View {
  let player: AVPlayer
  /// Called when the video reaches its end, for a feed that plays on.
  var onEnd: (() -> Void)?
  /// Whether the picture is filling the screen, and how to change that.
  var full = false
  var onFull: (() -> Void)?

  @State private var playing = false
  @State private var at = 0.0
  @State private var length = 0.0
  @State private var scrubbing = false
  @State private var showing = true
  @State private var ticker: Any?
  @State private var hiding: Task<Void, Never>?

  var body: some View {
    ZStack {
      PlayerSurface(player: player)

      // The whole picture is the button that brings the bar back.
      Color.clear
        .contentShape(Rectangle())
        .onTapGesture { showing ? hold() : reveal() }

      if showing {
        LinearGradient(colors: [.clear, .black.opacity(0.55)],
                       startPoint: .center, endPoint: .bottom)
          .allowsHitTesting(false)

        VStack {
          Spacer()
          HStack(spacing: 12) {
            Button(action: hold) {
              Group {
                if playing {
                  PauseMark(size: 22)
                } else {
                  Glyph(path: Ink.play, filled: true, weight: 1, size: 22)
                }
              }
              .foregroundStyle(.white)
              .frame(width: 30, height: 30)
            }
            .buttonStyle(Tappable())

            Text("\(clock(at)) / \(clock(length))")
              .font(Sans.semibold(12.5))
              .foregroundStyle(.white)
              .monospacedDigit()

            Track(at: $at, length: length, scrubbing: $scrubbing) { seconds in
              player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
            }

            if let onFull {
              Button {
                onFull()
                reveal()
              } label: {
                Glyph(path: full ? Ink.exit : Ink.full, weight: 1.9, size: 20)
                  .foregroundStyle(.white)
                  .frame(width: 30, height: 30)
              }
              .buttonStyle(Tappable())
            }
          }
          .padding(.horizontal, 12)
          .padding(.bottom, 10)
        }
        .transition(.opacity)
      }
    }
    .animation(.easeOut(duration: 0.18), value: showing)
    .onAppear { begin() }
    .onDisappear {
      hiding?.cancel()
      if let ticker { player.removeTimeObserver(ticker) }
      ticker = nil
    }
  }

  private func begin() {
    guard ticker == nil else { return }
    ticker = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.2, preferredTimescale: 600), queue: .main
    ) { time in
      if !scrubbing { at = time.seconds }
      if let item = player.currentItem, item.duration.isNumeric {
        length = item.duration.seconds
      }
      playing = player.timeControlStatus == .playing
    }
    NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime,
                                           object: player.currentItem, queue: .main) { _ in
      onEnd?()
    }
    player.play()
    reveal()
  }

  private func hold() {
    if player.timeControlStatus == .playing {
      player.pause()
      playing = false
      hiding?.cancel()           // a paused video keeps its bar
      showing = true
    } else {
      player.play()
      playing = true
      reveal()
    }
  }

  /// Show the bar, and take it away again once it has been read.
  private func reveal() {
    showing = true
    hiding?.cancel()
    hiding = Task {
      try? await Task.sleep(for: .seconds(3))
      guard !Task.isCancelled, player.timeControlStatus == .playing else { return }
      showing = false
    }
  }
}

/** The line showing how far through it is, and a way to move within it. */
struct Track: View {
  @Binding var at: Double
  let length: Double
  @Binding var scrubbing: Bool
  let seek: (Double) -> Void

  var body: some View {
    GeometryReader { geo in
      let width = geo.size.width
      let through = length > 0 ? min(max(at / length, 0), 1) : 0

      ZStack(alignment: .leading) {
        Capsule().fill(.white.opacity(0.28))
        Capsule().fill(Brand.green).frame(width: width * through)
        Circle()
          .fill(.white)
          .frame(width: scrubbing ? 14 : 10, height: scrubbing ? 14 : 10)
          .offset(x: width * through - (scrubbing ? 7 : 5))
      }
      .frame(height: 4)
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
    .frame(height: 28)
  }
}
