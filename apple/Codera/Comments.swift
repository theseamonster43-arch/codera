import SwiftUI
import FirebaseFirestore

/**
 * What people said under a post.
 *
 * The same thread the website and the Android app show, in two places: on a
 * watch page, where it belongs on the page under the video, and over a short,
 * where there is no page to put it on. It holds its listener only while it is
 * on screen — a feed of 150 posts would otherwise be 150 live threads nobody
 * is reading.
 */
struct CommentThread: View {
  let post: Post
  /// Whether it scrolls itself, or sits inside a page that already does.
  var scrolls = true
  var heading = true

  @EnvironmentObject var store: Store

  @State private var said: [Comment] = []
  @State private var loading = true
  @State private var draft = ""
  @State private var sending = false
  @State private var problem: String?
  @State private var listener: ListenerRegistration?
  @FocusState private var writing: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if heading {
        Text(said.isEmpty ? "Comments" : plural(said.count, "comment"))
          .font(Sans.bold(17))
          .foregroundStyle(Brand.text)
          .padding(.bottom, 12)
      }

      if scrolls {
        ScrollView { rows.padding(.bottom, 8) }
        Divider().overlay(Brand.line)
      } else {
        rows
      }

      box
    }
    .onAppear {
      guard listener == nil else { return }
      listener = store.watchComments(on: post.id) { comments in
        said = comments
        loading = false
      }
    }
    .onDisappear {
      listener?.remove()
      listener = nil
    }
  }

  @ViewBuilder
  private var rows: some View {
    if loading {
      ProgressView().tint(Brand.muted)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    } else if said.isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        Text("No comments yet").font(Sans.bold(15)).foregroundStyle(Brand.text)
        Text("Say the first thing.").font(Sans.regular(14)).foregroundStyle(Brand.muted)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.vertical, 18)
    } else {
      LazyVStack(alignment: .leading, spacing: 18) {
        ForEach(said) { row($0) }
      }
      .padding(.vertical, 4)
    }
  }

  private func row(_ one: Comment) -> some View {
    HStack(alignment: .top, spacing: 10) {
      Avatar(url: one.authorPhoto, size: 32)
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 7) {
          Text(one.authorName).font(Sans.bold(13.5)).foregroundStyle(Brand.text)
          Text(ago(one.createdAt)).font(Sans.medium(12)).foregroundStyle(Brand.muted)
        }
        Text(one.text)
          .font(Sans.regular(15))
          .foregroundStyle(Brand.text)
          .textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 0)
    }
    .id(one.id)
    // Your own anywhere, or anything under your own post.
    .contextMenu {
      if one.uid == store.user?.uid || post.uid == store.user?.uid {
        Button("Delete", role: .destructive) {
          Task { await store.unsay(one, on: post) }
        }
      }
    }
  }

  private var box: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let problem {
        Text(problem)
          .font(Sans.medium(13))
          .foregroundStyle(Brand.red)
          .fixedSize(horizontal: false, vertical: true)
      }
      HStack(spacing: 10) {
        TextField("Add a comment", text: $draft, axis: .vertical)
          .lineLimit(1...4)
          .focused($writing)
          .font(Sans.regular(15))
          .padding(.horizontal, 14)
          .padding(.vertical, 11)
          .background(Brand.bg3, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Brand.line, lineWidth: 1)
          )
          .onChange(of: draft) { _, _ in problem = nil }

        Button(action: send) {
          Glyph(path: Ink.send, weight: 2.1, size: 19)
            .foregroundStyle(.white)
            .frame(width: 40, height: 40)
            .background(Brand.mark, in: Circle())
            .opacity(canSend ? 1 : 0.4)
        }
        .buttonStyle(Tappable())
        .disabled(!canSend)
      }
    }
    .padding(.top, 12)
  }

  private var canSend: Bool {
    !sending && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private func send() {
    let body = draft
    sending = true
    problem = nil
    Task {
      do {
        try await store.say(body, on: post)
        draft = ""
        writing = false
      } catch {
        problem = error.localizedDescription
      }
      sending = false
    }
  }
}

/** The thread raised over something that has no page of its own — a short. */
struct CommentSheet: View {
  let post: Post
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    // The heading is drawn here rather than left to a navigation bar: a bar
    // with a background set takes its own appearance object with it, and that
    // object carries Apple's font, not Codera's.
    VStack(spacing: 0) {
      HStack {
        Text("Comments")
          .font(Sans.heavy(17))
          .foregroundStyle(Brand.text)
        Spacer(minLength: 8)
        // The glass capsule a toolbar would have given it, kept — with
        // Codera's lettering on it rather than Apple's.
        Button { dismiss() } label: {
          Text("Close").font(Sans.semibold(15))
        }
        .buttonStyle(.glass)
        .tint(Brand.text)
      }
      .padding(.horizontal, 16)
      .padding(.top, 18)
      .padding(.bottom, 14)
      .background(Brand.bg2)

      Divider().overlay(Brand.line)

      CommentThread(post: post, scrolls: true, heading: false)
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
    }
    .background(Brand.bg)
    .presentationDetents([.medium, .large])
    .presentationBackground(Brand.bg)
  }
}
