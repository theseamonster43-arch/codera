import SwiftUI
import PhotosUI
import AVFoundation

/**
 * Making something: a post, a short, a video, or going live.
 *
 * Everything is written the way the website and the Android app write it — the
 * same collections, the same field names — so a post made on a Vision Pro looks
 * like any other post everywhere else.
 */
struct ComposePost: View {
  @EnvironmentObject var store: Store
  @Environment(\.dismiss) private var dismiss

  @State private var title = ""
  @State private var body_ = ""
  @State private var code = ""
  @State private var lang = "python"
  @State private var picked: PhotosPickerItem?
  @State private var image: Data?
  @State private var busy = false
  @State private var error = ""

  private let langs = ["python", "javascript", "swift", "java", "c++", "html", "css", "sql"]

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Title", text: $title).font(Sans.bold(16))
          TextField("Say more (optional)", text: $body_, axis: .vertical).lineLimit(3...8)
        }

        Section("Code (optional)") {
          TextEditor(text: $code)
            .font(.system(.footnote, design: .monospaced))
            .frame(minHeight: 110)
          Picker("Language", selection: $lang) {
            ForEach(langs, id: \.self) { Text($0.uppercased()).tag($0) }
          }
        }

        Section {
          PhotosPicker(selection: $picked, matching: .images) {
            Label(image == nil ? "Add a picture" : "Picture added", systemImage: "photo")
          }
          if let image, let ui = UIImage(data: image) {
            Image(uiImage: ui).resizable().scaledToFill().frame(height: 160).clipped()
              .clipShape(RoundedRectangle(cornerRadius: 12))
          }
        }

        if !error.isEmpty {
          Text(error).font(Sans.medium(13)).foregroundStyle(Brand.red)
        }
      }
      .navigationTitle("New post")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button(busy ? "Posting…" : "Post") { post() }
            .disabled(busy || title.trimmingCharacters(in: .whitespaces).isEmpty)
        }
      }
      .task(id: picked) {
        image = try? await picked?.loadTransferable(type: Data.self)
      }
    }
  }

  private func post() {
    busy = true
    error = ""
    Task {
      do {
        try await store.createPost(title: title, body: body_, code: code, lang: lang, image: image)
        dismiss()
      } catch {
        self.error = error.localizedDescription
        busy = false
      }
    }
  }
}

/** A short or a full video: pick the file, name it, upload. */
struct ComposeVideo: View {
  let kind: String                       // "short" or "video"
  @EnvironmentObject var store: Store
  @Environment(\.dismiss) private var dismiss

  @State private var title = ""
  @State private var about = ""
  @State private var picked: PhotosPickerItem?
  @State private var file: URL?
  @State private var busy = false
  @State private var progress = 0.0
  @State private var error = ""

  private var word: String { kind == "short" ? "short" : "video" }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          PhotosPicker(selection: $picked, matching: .videos) {
            Label(file == nil ? "Choose a \(word)" : "Ready to upload", systemImage: "film")
          }
          if kind == "short" {
            Text("Shorts are tall videos, under a minute.")
              .font(Sans.regular(13)).foregroundStyle(Brand.muted)
          }
        }

        Section {
          TextField("Title", text: $title).font(Sans.bold(16))
          TextField("Description (optional)", text: $about, axis: .vertical).lineLimit(2...6)
        }

        if busy {
          Section { ProgressView(value: progress) { Text("Uploading… \(Int(progress * 100))%").font(Sans.medium(13)) } }
        }
        if !error.isEmpty {
          Text(error).font(Sans.medium(13)).foregroundStyle(Brand.red)
        }
      }
      .navigationTitle(kind == "short" ? "New short" : "New video")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button(busy ? "Uploading…" : "Upload") { upload() }
            .disabled(busy || file == nil || title.trimmingCharacters(in: .whitespaces).isEmpty)
        }
      }
      .task(id: picked) {
        // Photos hands over a copy; it is read straight from there.
        guard let picked else { return }
        if let movie = try? await picked.loadTransferable(type: Movie.self) { file = movie.url }
      }
    }
  }

  private func upload() {
    guard let file else { return }
    busy = true
    error = ""
    Task {
      do {
        try await store.uploadVideo(url: file, kind: kind, title: title, about: about) { progress = $0 }
        dismiss()
      } catch {
        self.error = error.localizedDescription
        busy = false
      }
    }
  }
}

/** What Photos hands back for a video: a file on disk. */
struct Movie: Transferable {
  let url: URL

  static var transferRepresentation: some TransferRepresentation {
    FileRepresentation(contentType: .movie) { movie in
      SentTransferredFile(movie.url)
    } importing: { received in
      let copy = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString + "." + received.file.pathExtension)
      try? FileManager.default.removeItem(at: copy)
      try FileManager.default.copyItem(at: received.file, to: copy)
      return Movie(url: copy)
    }
  }
}

/** Your own page, edited: the description, your picture and your banner. */
struct EditProfile: View {
  @EnvironmentObject var store: Store
  @Environment(\.dismiss) private var dismiss

  @State private var bio = ""
  @State private var photo: PhotosPickerItem?
  @State private var banner: PhotosPickerItem?
  @State private var busy = false
  @State private var error = ""

  var body: some View {
    NavigationStack {
      Form {
        Section("Description") {
          TextField("Say what you post about.", text: $bio, axis: .vertical)
            .lineLimit(3...6)
            .font(Sans.regular(15))
        }

        Section("Pictures") {
          PhotosPicker(selection: $photo, matching: .images) {
            Label("Change your picture", systemImage: "person.crop.circle")
          }
          PhotosPicker(selection: $banner, matching: .images) {
            Label("Change your banner", systemImage: "photo.on.rectangle")
          }
        }

        if busy { ProgressView() }
        if !error.isEmpty { Text(error).font(Sans.medium(13)).foregroundStyle(Brand.red) }
      }
      .navigationTitle("Edit page")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") { save() }.disabled(busy)
        }
      }
      .task {
        if let uid = store.user?.uid {
          await store.loadProfile(uid)
          bio = store.profiles[uid]?.bio ?? ""
        }
      }
      .task(id: photo) { await put(photo, as: "photo") }
      .task(id: banner) { await put(banner, as: "banner") }
    }
  }

  private func put(_ item: PhotosPickerItem?, as kind: String) async {
    guard let item, let data = try? await item.loadTransferable(type: Data.self) else { return }
    busy = true
    do { try await store.setProfileImage(data, kind: kind) } catch { self.error = error.localizedDescription }
    busy = false
  }

  private func save() {
    busy = true
    Task {
      do {
        try await store.setBio(bio)
        dismiss()
      } catch {
        self.error = error.localizedDescription
        busy = false
      }
    }
  }
}
