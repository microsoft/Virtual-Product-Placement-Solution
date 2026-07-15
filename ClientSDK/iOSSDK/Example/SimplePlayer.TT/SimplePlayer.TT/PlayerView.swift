//
//  PlayerView.swift
//  SimplePlayer.TT
//

import SwiftUI
import IOSSDKSampleBuffer

struct PlayerView: View {
    let url: URL
    /// Optional override for the session's serviceConfig. When `nil`,
    /// the view model keeps its bundle-default `ServiceConfig.json` (the
    /// "Open Video" path); when set, the view adopts a remote-library
    /// entry's pubVideoId/secretKey before loading.
    let serviceConfig: AdServiceConfig?
    /// When non-nil, the view model skips the remote ad-service fetch and
    /// loads the named bundled JSON resource as the manifest (e.g. `"32"`
    /// resolves to `32.json` in the app bundle). Used by the "Open Video"
    /// route to mock a known manifest for any locally-picked video.
    let localManifestResource: String?

    init(
        url: URL,
        serviceConfig: AdServiceConfig? = nil,
        localManifestResource: String? = nil
    ) {
        self.url = url
        self.serviceConfig = serviceConfig
        self.localManifestResource = localManifestResource
    }

    @State private var viewModel = PlayerViewModel()
    @State private var showControls = true
    @State private var showFilePicker = false
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Video area
                ZStack {
                    Color.black
                    if viewModel.hasVideo {
                        if let renderer = viewModel.renderer {
                            SampleBufferDisplayView(renderer: renderer, viewModel: viewModel)
                        } else {
                            // Metal unavailable — fall back to the SDK's own view.
                            EnginePlayerView(engine: viewModel.engine)
                        }
                    }
                    // Cover the half-rendered first frame with a black
                    // backdrop + spinner until every ad texture is ready.
                    if viewModel.hasVideo && !viewModel.session.isAdsReady {
                        ZStack {
                            Color.black
                            VStack(spacing: 12) {
                                ProgressView()
                                    .progressViewStyle(.circular)
                                    .tint(.white)
                                    .controlSize(.large)
                                Text("Loading ads…")
                                    .font(.footnote)
                                    .foregroundStyle(.white.opacity(0.8))
                            }
                        }
                        .transition(.opacity)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        showControls.toggle()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                // Frame info overlay (top-right)
                if viewModel.hasVideo {
                    VStack {
                        HStack {
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("Timestamp: \(viewModel.frameTimestamp) / 1000")
                                Text("Display Frame (CVT): \(viewModel.session.ptsFrameIndex)")
                                Text("Manifest Frame: \(viewModel.session.manifestFrameIndex)")
                                Text("Frame Offset: \(viewModel.session.frameOffset) (\(String(format: "%.3fs", viewModel.session.frameZeroPts)))")
                                Text(String(format: "PTS: %.3fs", viewModel.framePTS))
                                Text(String(format: "FPS: %.1f", viewModel.fps))
                                Text(String(format: "Video FPS: %.2f", viewModel.nominalFPS))
                            }
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(.white)
                            .padding(8)
                            .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
                            .padding(.trailing, 12)
                            .padding(.top, 50)
                        }
                        Spacer()
                    }
                    .allowsHitTesting(false)
                }

                // Controls overlay (bottom)
                if showControls {
                    VStack {
                        Spacer()
                        VStack(spacing: 8) {
                            // Progress bar
                            if viewModel.duration > 0 {
                                HStack(spacing: 8) {
                                    Text(formatTime(viewModel.currentTime))
                                        .font(.caption)
                                        .monospacedDigit()
                                        .foregroundStyle(.secondary)

                                    Slider(
                                        value: $viewModel.currentTime,
                                        in: 0...max(viewModel.duration, 1)
                                    ) { editing in
                                        if !editing {
                                            viewModel.seek(to: viewModel.currentTime)
                                        }
                                    }

                                    Text(formatTime(viewModel.duration))
                                        .font(.caption)
                                        .monospacedDigit()
                                        .foregroundStyle(.secondary)
                                }
                            }

                            // Ad jump buttons (one per ad slot, jumps to the ad's first frame).
                            if !viewModel.session.allAdSlots.isEmpty {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 8) {
                                        ForEach(viewModel.session.allAdSlots, id: \.adIndex) { slot in
                                            Button {
                                                viewModel.jumpToAdSlot(slot)
                                            } label: {
                                                let adTime = viewModel.session.videoTime(forManifestFrame: slot.startFrame)
                                                VStack(spacing: 1) {
                                                    Text("Ad #\(slot.adIndex)")
                                                        .font(.caption2)
                                                        .fontWeight(.semibold)
                                                    Text("→ \(formatTime(max(0, adTime)))")
                                                        .font(.caption2)
                                                        .monospacedDigit()
                                                        .foregroundStyle(.secondary)
                                                }
                                                .padding(.horizontal, 10)
                                                .padding(.vertical, 4)
                                                .background(.tint.opacity(0.2), in: Capsule())
                                            }
                                            .buttonStyle(.plain)
                                            .disabled(!viewModel.session.isAdsReady)
                                            .opacity(viewModel.session.isAdsReady ? 1.0 : 0.4)
                                        }
                                    }
                                    .padding(.horizontal, 4)
                                }
                            }

                            // Playback controls
                            HStack(spacing: 20) {
                                Button {
                                    showFilePicker = true
                                } label: {
                                    Image(systemName: "folder.fill")
                                        .font(.title3)
                                }

                                Button {
                                    viewModel.seek(to: 0)
                                } label: {
                                    Image(systemName: "backward.end.fill")
                                        .font(.title3)
                                }

                                Button {
                                    viewModel.seek(to: max(viewModel.currentTime - 10, 0))
                                } label: {
                                    Image(systemName: "gobackward.10")
                                        .font(.title3)
                                }

                                Button {
                                    viewModel.seek(to: max(viewModel.currentTime - 5, 0))
                                } label: {
                                    Image(systemName: "gobackward.5")
                                        .font(.title3)
                                }

                                Button {
                                    viewModel.togglePlayPause()
                                } label: {
                                    if viewModel.hasVideo && !viewModel.session.isAdsReady {
                                        // Ad textures still preparing — show a
                                        // spinner instead of a tappable play icon
                                        // so the user understands the wait.
                                        ProgressView()
                                            .controlSize(.large)
                                            .frame(width: 44, height: 44)
                                    } else {
                                        Image(systemName: viewModel.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                            .font(.system(size: 44))
                                    }
                                }
                                .disabled(viewModel.hasVideo && !viewModel.session.isAdsReady)

                                Button {
                                    viewModel.seek(to: min(viewModel.currentTime + 5, viewModel.duration))
                                } label: {
                                    Image(systemName: "goforward.5")
                                        .font(.title3)
                                }

                                Button {
                                    viewModel.seek(to: min(viewModel.currentTime + 10, viewModel.duration))
                                } label: {
                                    Image(systemName: "goforward.10")
                                        .font(.title3)
                                }

                                Button {
                                    viewModel.stop()
                                } label: {
                                    Image(systemName: "stop.fill")
                                        .font(.title3)
                                }

                                Button {
                                    viewModel.cyclePlaybackRate()
                                } label: {
                                    Text("\(viewModel.playbackRate, specifier: "%.1f")x")
                                        .font(.caption)
                                        .fontWeight(.semibold)
                                        .frame(minWidth: 36)
                                }
                            }
                        }
                        .padding()
                        .padding(.bottom, verticalSizeClass == .compact ? 0 : geometry.safeAreaInsets.bottom)
                        .background(.ultraThinMaterial)
                    }
                    .allowsHitTesting(true)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .ignoresSafeArea()
        .navigationBarBackButtonHidden(false)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .onAppear {
            // Apply the route-supplied config (if any) before kicking off
            // the manifest fetch so we land on the right pubVideoId.
            if let serviceConfig {
                viewModel.session.serviceConfig = serviceConfig
            }
            // Force the local-mock route to bypass the remote ad service
            // and use the bundled JSON snapshot instead.
            viewModel.session.localManifestResource = localManifestResource
            viewModel.loadVideo(url: url)
        }
        .onDisappear {
            viewModel.reset()
        }
        .sheet(isPresented: $showFilePicker) {
            DocumentPicker { newURL in
                viewModel.loadVideo(url: newURL)
            }
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
