import SwiftUI

/**
 * Codera's icons, drawn from the same path data the website uses.
 *
 * SF Symbols are Apple's drawing, and a thumb that is Apple's thumb on the
 * phone and Codera's thumb in the browser is two different products. Rather
 * than redraw each one by hand and let the two drift, the website's paths are
 * copied across as text and drawn here — one shape, one source.
 *
 * Everything is written in a 24 by 24 box and scaled to whatever it is given.
 */
struct Glyph: View {
  let path: String
  var filled = false
  var weight: CGFloat = 1.8
  var size: CGFloat = 22

  var body: some View {
    SVGShape(d: path)
      .fill(filled ? AnyShapeStyle(.foreground) : AnyShapeStyle(.clear))
      .overlay(
        SVGShape(d: path)
          .stroke(style: StrokeStyle(lineWidth: weight, lineCap: .round, lineJoin: .round))
      )
      .frame(width: size, height: size)
  }
}

/** The icons themselves. The strings are the website's, unchanged. */
enum Ink {
  static let up = "M7 10.5h2.6l1.9-5a2 2 0 0 1 3.8 1.1l-.6 3.9h4a1.9 1.9 0 0 1 1.9 2.2l-.9 5.5A2.4 2.4 0 0 1 17.4 20H7z M3.5 10.5H7V20H3.5z"
  static let comment = "M21 11.5a8 8 0 0 1-8 8H7l-4 2.5V11.5a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"
  static let play = "M7.5 4.9v14.2a.7.7 0 0 0 1.07.6l11.2-7.1a.7.7 0 0 0 0-1.2L8.57 4.3A.7.7 0 0 0 7.5 4.9z"
  static let full = "M9.2 3.6H4.8a1.2 1.2 0 0 0-1.2 1.2v4.4M14.8 3.6h4.4a1.2 1.2 0 0 1 1.2 1.2v4.4M9.2 20.4H4.8a1.2 1.2 0 0 1-1.2-1.2v-4.4M14.8 20.4h4.4a1.2 1.2 0 0 0 1.2-1.2v-4.4"
  static let code = "M8.5 8 5 12l3.5 4M15.5 8l3.5 4-3.5 4M13.6 5.5l-3.2 13"
  // A rectangle, a sun in it and a hill across it — written out as path data,
  // because that is all this draws.
  static let image = "M6 4.5h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z M6.9 10a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 1 0-3.4 0 M3.4 17.2 9 12.3l4 3.3 3.2-2.6 4.4 3.8"
  static let search = "M10.6 3.8a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6M15.7 15.7 20.4 20.4"
  static let send = "M12 19.2V5.2M5.6 11.6 12 5.2l6.4 6.4"
  static let exit = "M3.6 9.2H8a1.2 1.2 0 0 0 1.2-1.2V3.6M20.4 9.2H16a1.2 1.2 0 0 1-1.2-1.2V3.6M3.6 14.8H8a1.2 1.2 0 0 1 1.2 1.2v4.4M20.4 14.8H16a1.2 1.2 0 0 0-1.2 1.2v4.4"
}

/** A thumb, up or down — down is the same drawing turned over. */
struct Thumb: View {
  var down = false
  var on = false
  var size: CGFloat = 22

  var body: some View {
    Glyph(path: Ink.up, filled: on, weight: 1.8, size: size)
      .rotationEffect(.degrees(down ? 180 : 0))
  }
}

/** Two bars. Drawn rather than parsed — it is two rectangles. */
struct PauseMark: View {
  var size: CGFloat = 22

  var body: some View {
    HStack(spacing: size * 0.13) {
      ForEach(0..<2, id: \.self) { _ in
        RoundedRectangle(cornerRadius: size * 0.055, style: .continuous)
          .frame(width: size * 0.16, height: size * 0.58)
      }
    }
    .frame(width: size, height: size)
  }
}

// ---------------------------------------------------------------------------
// Reading SVG path data
// ---------------------------------------------------------------------------

/** A shape built from an SVG `d` string written in a 24 by 24 box. */
struct SVGShape: Shape {
  let d: String

  func path(in rect: CGRect) -> Path {
    let drawn = SVGPen(d).draw()
    let scale = min(rect.width, rect.height) / 24
    let across = (rect.width - 24 * scale) / 2
    let down = (rect.height - 24 * scale) / 2
    return drawn.applying(
      CGAffineTransform(scaleX: scale, y: scale)
        .concatenating(CGAffineTransform(translationX: rect.minX + across, y: rect.minY + down))
    )
  }
}

/**
 * Follows an SVG path string.
 *
 * Every command SVG has for a curve is here because the icons use most of
 * them, arcs included — a rounded corner in a stroked icon is written as an
 * arc, and dropping them would square off every corner.
 */
private struct SVGPen {
  private let text: String

  init(_ d: String) { text = d }

  func draw() -> Path {
    var path = Path()
    var at = CGPoint.zero        // where the pen is
    var start = CGPoint.zero     // where the current run began
    var lastControl: CGPoint?    // for S and T, which reflect the one before
    var command: Character = "M"
    var args: [Double] = []

    let tokens = SVGPen.split(text)
    var i = 0

    func next(_ n: Int) -> [Double]? {
      guard args.count >= n else { args = []; return nil }
      let taken = Array(args.prefix(n))
      args.removeFirst(n)
      return taken
    }

    while i < tokens.count {
      guard case .letter(let c) = tokens[i] else { i += 1; continue }
      command = c
      args = []
      i += 1
      while i < tokens.count, case .number(let v) = tokens[i] {
        args.append(v)
        i += 1
      }

      let relative = command.isLowercase
      let kind = Character(command.uppercased())
      var first = true

      repeat {
        switch kind {
        case "M":
          guard let v = next(2) else { break }
          let to = relative ? CGPoint(x: at.x + v[0], y: at.y + v[1]) : CGPoint(x: v[0], y: v[1])
          // Only the first pair moves; the rest are lines, as SVG says.
          if first {
            path.move(to: to)
            start = to
          } else {
            path.addLine(to: to)
          }
          at = to
          lastControl = nil
        case "L":
          guard let v = next(2) else { break }
          let to = relative ? CGPoint(x: at.x + v[0], y: at.y + v[1]) : CGPoint(x: v[0], y: v[1])
          path.addLine(to: to)
          at = to
          lastControl = nil
        case "H":
          guard let v = next(1) else { break }
          let to = CGPoint(x: relative ? at.x + v[0] : v[0], y: at.y)
          path.addLine(to: to)
          at = to
          lastControl = nil
        case "V":
          guard let v = next(1) else { break }
          let to = CGPoint(x: at.x, y: relative ? at.y + v[0] : v[0])
          path.addLine(to: to)
          at = to
          lastControl = nil
        case "C":
          guard let v = next(6) else { break }
          let c1 = relative ? CGPoint(x: at.x + v[0], y: at.y + v[1]) : CGPoint(x: v[0], y: v[1])
          let c2 = relative ? CGPoint(x: at.x + v[2], y: at.y + v[3]) : CGPoint(x: v[2], y: v[3])
          let to = relative ? CGPoint(x: at.x + v[4], y: at.y + v[5]) : CGPoint(x: v[4], y: v[5])
          path.addCurve(to: to, control1: c1, control2: c2)
          at = to
          lastControl = c2
        case "S":
          guard let v = next(4) else { break }
          let mirrored = lastControl.map { CGPoint(x: 2 * at.x - $0.x, y: 2 * at.y - $0.y) } ?? at
          let c2 = relative ? CGPoint(x: at.x + v[0], y: at.y + v[1]) : CGPoint(x: v[0], y: v[1])
          let to = relative ? CGPoint(x: at.x + v[2], y: at.y + v[3]) : CGPoint(x: v[2], y: v[3])
          path.addCurve(to: to, control1: mirrored, control2: c2)
          at = to
          lastControl = c2
        case "Q":
          guard let v = next(4) else { break }
          let c = relative ? CGPoint(x: at.x + v[0], y: at.y + v[1]) : CGPoint(x: v[0], y: v[1])
          let to = relative ? CGPoint(x: at.x + v[2], y: at.y + v[3]) : CGPoint(x: v[2], y: v[3])
          path.addQuadCurve(to: to, control: c)
          at = to
          lastControl = c
        case "T":
          guard let v = next(2) else { break }
          let c = lastControl.map { CGPoint(x: 2 * at.x - $0.x, y: 2 * at.y - $0.y) } ?? at
          let to = relative ? CGPoint(x: at.x + v[0], y: at.y + v[1]) : CGPoint(x: v[0], y: v[1])
          path.addQuadCurve(to: to, control: c)
          at = to
          lastControl = c
        case "A":
          guard let v = next(7) else { break }
          let to = relative ? CGPoint(x: at.x + v[5], y: at.y + v[6]) : CGPoint(x: v[5], y: v[6])
          SVGPen.arc(&path, from: at, to: to, rx: v[0], ry: v[1],
                     turn: v[2], big: v[3] != 0, sweep: v[4] != 0)
          at = to
          lastControl = nil
        default:
          path.closeSubpath()
          at = start
          args = []
          lastControl = nil
        }
        first = false
      } while !args.isEmpty

      // A move that closes nothing still has to leave the pen somewhere.
      if kind == "Z" { at = start }
    }
    return path
  }

  /// An elliptical arc, as a run of curves. SVG gives the far end; the middle
  /// has to be worked back out of it.
  private static func arc(_ path: inout Path, from: CGPoint, to: CGPoint,
                          rx: Double, ry: Double, turn: Double, big: Bool, sweep: Bool) {
    guard rx != 0, ry != 0 else { path.addLine(to: to); return }
    var rx = abs(rx), ry = abs(ry)
    let angle = turn * .pi / 180
    let dx = (from.x - to.x) / 2, dy = (from.y - to.y) / 2
    let x1 = cos(angle) * dx + sin(angle) * dy
    let y1 = -sin(angle) * dx + cos(angle) * dy

    // An ellipse too small to reach is grown until it does.
    let check = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
    if check > 1 {
      rx *= check.squareRoot()
      ry *= check.squareRoot()
    }

    let top = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
    let bottom = rx * rx * y1 * y1 + ry * ry * x1 * x1
    var scale = bottom == 0 ? 0 : (max(0, top) / bottom).squareRoot()
    if big == sweep { scale = -scale }

    let cx1 = scale * rx * y1 / ry
    let cy1 = -scale * ry * x1 / rx
    let cx = cos(angle) * cx1 - sin(angle) * cy1 + (from.x + to.x) / 2
    let cy = sin(angle) * cx1 + cos(angle) * cy1 + (from.y + to.y) / 2

    func between(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
      let dot = ux * vx + uy * vy
      let len = (ux * ux + uy * uy).squareRoot() * (vx * vx + vy * vy).squareRoot()
      let sign: Double = (ux * vy - uy * vx) < 0 ? -1 : 1
      return sign * acos(min(1, max(-1, len == 0 ? 1 : dot / len)))
    }

    let opens = between(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    var span = between((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if !sweep && span > 0 { span -= 2 * .pi }
    if sweep && span < 0 { span += 2 * .pi }

    // Quarter turn at a time, which a cubic follows closely enough to see.
    let steps = max(1, Int(ceil(abs(span) / (.pi / 2))))
    let each = span / Double(steps)
    let handle = 4.0 / 3 * tan(each / 4)
    var t = opens

    for _ in 0..<steps {
      let t2 = t + each
      let p1 = onArc(cx, cy, rx, ry, angle, t)
      let p2 = onArc(cx, cy, rx, ry, angle, t2)
      let d1 = slope(rx, ry, angle, t)
      let d2 = slope(rx, ry, angle, t2)
      path.addCurve(
        to: p2,
        control1: CGPoint(x: p1.x + handle * d1.x, y: p1.y + handle * d1.y),
        control2: CGPoint(x: p2.x - handle * d2.x, y: p2.y - handle * d2.y)
      )
      t = t2
    }
  }

  private static func onArc(_ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double,
                            _ angle: Double, _ t: Double) -> CGPoint {
    CGPoint(x: cx + rx * cos(t) * cos(angle) - ry * sin(t) * sin(angle),
            y: cy + rx * cos(t) * sin(angle) + ry * sin(t) * cos(angle))
  }

  private static func slope(_ rx: Double, _ ry: Double,
                            _ angle: Double, _ t: Double) -> CGPoint {
    CGPoint(x: -rx * sin(t) * cos(angle) - ry * cos(t) * sin(angle),
            y: -rx * sin(t) * sin(angle) + ry * cos(t) * cos(angle))
  }

  private enum Token { case letter(Character), number(Double) }

  /// Path data is written without much punctuation: "M3 10.5 12 3l9 7.5V20"
  /// is eight numbers and four commands, and a minus sign starts a number
  /// rather than separating two.
  private static func split(_ d: String) -> [Token] {
    var out: [Token] = []
    var number = ""
    func flush() {
      if let v = Double(number) { out.append(.number(v)) }
      number = ""
    }
    for c in d {
      if c.isLetter && c != "e" && c != "E" {
        flush()
        out.append(.letter(c))
      } else if c == "-" || c == "+" {
        // part of an exponent, or the start of the next number
        if number.last == "e" || number.last == "E" {
          number.append(c)
        } else {
          flush()
          number.append(c)
        }
      } else if c == "." {
        // a second dot means a new number: "1.5.5" is 1.5 then .5
        if number.contains(".") { flush() }
        number.append(c)
      } else if c.isNumber || c == "e" || c == "E" {
        number.append(c)
      } else {
        flush()
      }
    }
    flush()
    return out
  }
}
