import SwiftUI
import FirebaseFirestore

/**
 * What people said under a post.
 *
 * Opened from the bubble, wherever the bubble is: over a short, or from a card
 * in the feed. It is the same thread the website and the Android app show, and
 * it holds its listener only while it is open — a feed of 150 posts would
 * otherwise be 150 live threads nobody is reading.
 */
struct CommentSheet: View {
  let post: Post
  @EnvironmentObject var store: Store
  @Environment(\.dismiss) private var dismiss

  @State private var said: [Comment] = []
  @State private var loading = true
  @State private var draft = ""
  @State private var sending = false
  @State private var problem: String?
  @State private var listener: ListenerRegistration?
  @FocusState private var writing: Bool

  var body: some View {
    // The heading is drawn here rather than left to a navigation bar: a bar
    // with a background set takes its own appearance object with it, and that
    // object carries Apple's font, not Codera's.
    VStack(spacing: 0) {
      HStack {
        Text(said.isEmpty ? "Comments" : "\(said.count) comment\(said.count == 1 ? "" : "s")")
          .font(Sans.heavy(17))
          .foregroundStyle(Brand.text)
        Spacer(minLength: 8)
        Button("Close") { dismiss() }
          .font(Sans.semibold(15))
          .tint(Brand.blue)
      }
      .padding(.horizontal, 16)
      .padding(.top, 18)
      .padding(.bottom, 14)
      .background(Brand.bg2)

      Divider().overlay(Brand.line)
      thread
      Divider().overlay(Brand.line)
      box
    }
    .background(Brand.bg)
    .presentationDetents([.medium, .large])
    .presentationBackground(Brand.bg)
    .onAppear {
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
  private var thread: some View {
    if loading {
      ProgressView().tint(Brand.muted).frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if said.isEmpty {
      VStack(spacing: 6) {
        Text("No comments yet").font(Sans.bold(16)).foregroundStyle(Brand.text)
        Text("Say the first thing.").font(Sans.regular(14)).foregroundStyle(Brand.muted)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      ScrollViewReader { scroll in
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 18) {
            ForEach(said) { one in row(one) }
          }
          .padding(16)
        }
        .onChange(of: said.count) { _, _ in
          // A comment lands at the bottom, so that is where the thread goes.
          guard let last = said.last else { return }
          withAnimation { scroll.scrollTo(last.id, anchor: .bottom) }
        }
      }
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
          Image(systemName: "arrow.up")
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 40, height: 40)
            .background(Brand.mark, in: Circle())
            .opacity(canSend ? 1 : 0.4)
        }
        .buttonStyle(.plain)
        .disabled(!canSend)
      }
    }
    .padding(14)
    .background(Brand.bg2)
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
