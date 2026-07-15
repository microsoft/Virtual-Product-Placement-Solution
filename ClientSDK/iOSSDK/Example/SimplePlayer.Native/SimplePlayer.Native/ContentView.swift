//
//  ContentView.swift
//  SimplePlayer.Native
//
//  Created by xiaoyxue on 2026/5/11.
//

import SwiftUI
import AVFoundation
import AVKit
import UniformTypeIdentifiers
import CoreVideo
import IOSSDKNative

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}

// MARK: - Player Route

/// Discriminates how `PlayerView` was reached:
///   - `.local(url, manifestName)` — user picked a file via "Open Video"
///     and then chose one of the bundled mock manifests listed in
///     `LocalConfigs.json`. The view model adopts the named JSON as its
///     manifest source (no network).
///   - `.remote(entry)` — user picked an entry from "Review Videos". The
///     view model adopts the entry's pubVideoId/secretKey and plays its
///     `videoUrl` (an mp4 link from `ServiceConfigs.json`).
enum PlayerRoute: Hashable, Identifiable {
    case local(URL, String)
    case remote(VideoServiceEntry)

    var id: String {
        switch self {
        case .local(let url, let manifestName):
            return "local:\(manifestName):\(url.absoluteString)"
        case .remote(let entry):
            return "remote:\(entry.pubVideoId)"
        }
    }
}

// MARK: - Content View (Home Screen)

struct ContentView: View {
    @State private var route: PlayerRoute?
    @State private var showFilePicker = false
    @State private var showVideoLibrary = false
    /// Local video URL from step 1.
    @State private var pickedLocalURL: URL?
    @State private var showLocalManifestPicker = false
    /// Manifest selected in step 2. Promoted to `route` only after the
    /// sheet finishes dismissing — setting `route` mid-dismiss races with
    /// SwiftUI and drops the navigation.
    @State private var pendingManifestName: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()
                Image(systemName: "film")
                    .font(.system(size: 80))
                    .foregroundStyle(.tint)
                Text("Simple Player")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                Text("Native")
                    .font(.largeTitle)
                    .fontWeight(.bold)    
                Text("Select a video to play")
                    .foregroundStyle(.secondary)
                Button {
                    showFilePicker = true
                } label: {
                    Label("Open Video", systemImage: "folder.fill")
                        .font(.headline)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)

                Button {
                    showVideoLibrary = true
                } label: {
                    Label("Review Videos", systemImage: "list.and.film")
                        .font(.headline)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.bordered)
                Spacer()
            }
            .navigationTitle("Simple Player")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showFilePicker) {
                DocumentPicker { url in
                    // Step 1 -> step 2: stash URL, open manifest picker.
                    pickedLocalURL = url
                    showLocalManifestPicker = true
                }
            }
            .sheet(
                isPresented: $showLocalManifestPicker,
                onDismiss: {
                    // Push the player only after dismiss completes.
                    if let url = pickedLocalURL, let name = pendingManifestName {
                        route = .local(url, name)
                    }
                    pickedLocalURL = nil
                    pendingManifestName = nil
                }
            ) {
                LocalManifestPickerView { entry in
                    pendingManifestName = entry.name
                    showLocalManifestPicker = false
                }
            }
            .sheet(isPresented: $showVideoLibrary) {
                VideoLibraryView { entry in
                    showVideoLibrary = false
                    route = .remote(entry)
                }
            }
            .navigationDestination(item: $route) { route in
                switch route {
                case .local(let url, let manifestName):
                    // "Open Video" mocks the manifest from the bundled JSON
                    // the user picked in the second-step picker (driven by
                    // `LocalConfigs.json`).
                    PlayerView(url: url, localManifestResource: manifestName)
                case .remote(let entry):
                    if let remoteURL = URL(string: entry.videoUrl) {
                        PlayerView(url: remoteURL, serviceConfig: entry.makeServiceConfig())
                    } else {
                        Text("Invalid videoUrl for \(entry.pubVideoId)")
                    }
                }
            }
        }
    }
}

// MARK: - Video Library

/// Lists every entry in the bundled `ServiceConfigs.json`. Tapping one
/// dismisses the sheet and pushes `PlayerView` configured for that entry.
struct VideoLibraryView: View {
    let onSelect: (VideoServiceEntry) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var entries: [VideoServiceEntry] = []

    var body: some View {
        NavigationStack {
            Group {
                if entries.isEmpty {
                    ContentUnavailableView(
                        "No Videos",
                        systemImage: "film.stack",
                        description: Text("ServiceConfigs.json is missing or empty.")
                    )
                } else {
                    List(entries) { entry in
                        Button {
                            onSelect(entry)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(entry.pubVideoId)
                                    .font(.headline)
                                Text(entry.videoUrl)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("Review Videos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
            .onAppear {
                if entries.isEmpty {
                    entries = VideoServiceList.loadFromBundle()?.videoServices ?? []
                }
            }
        }
    }
}

// MARK: - Local Manifest Picker

/// Step 2 of the "Open Video" flow: after the user picks a local .mp4,
/// this sheet lists every entry in `LocalConfigs.json` so they can pick
/// which bundled JSON snapshot to use as the mock ad manifest.
struct LocalManifestPickerView: View {
    let onSelect: (LocalManifestEntry) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var entries: [LocalManifestEntry] = []

    var body: some View {
        NavigationStack {
            Group {
                if entries.isEmpty {
                    ContentUnavailableView(
                        "No Manifests",
                        systemImage: "doc.text.magnifyingglass",
                        description: Text("LocalConfigs.json is missing or empty.")
                    )
                } else {
                    List(entries) { entry in
                        Button {
                            onSelect(entry)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(entry.label)
                                    .font(.headline)
                                Text("\(entry.name).json")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("Pick Mock Manifest")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                if entries.isEmpty {
                    entries = LocalConfigList.loadFromBundle()?.manifests ?? []
                }
            }
        }
    }
}

// MARK: - Document Picker

struct DocumentPicker: UIViewControllerRepresentable {
    var onPick: (URL) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.movie, UTType.mpeg4Movie, UTType.video])
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick)
    }

    class Coordinator: NSObject, UIDocumentPickerDelegate {
        var onPick: (URL) -> Void
        init(onPick: @escaping (URL) -> Void) {
            self.onPick = onPick
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first else { return }
            if url.startAccessingSecurityScopedResource() {
                onPick(url)
            }
        }
    }
}

#Preview {
    ContentView()
}
