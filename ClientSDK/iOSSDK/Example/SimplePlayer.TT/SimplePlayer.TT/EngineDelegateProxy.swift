//
//  EngineDelegateProxy.swift
//  SimplePlayer.TT
//

import Foundation

class EngineDelegateProxy: NSObject, TTVideoEngineDelegate {
    var onPlaybackStateChanged: ((TTVideoEnginePlaybackState) -> Void)?
    var onLoadStateChanged: ((TTVideoEngineLoadState) -> Void)?
    var onPrepared: (() -> Void)?
    var onFinished: ((Error?) -> Void)?

    func videoEngine(_ videoEngine: TTVideoEngine,
                     playbackStateDidChanged playbackState: TTVideoEnginePlaybackState) {
        DispatchQueue.main.async { [weak self] in
            self?.onPlaybackStateChanged?(playbackState)
        }
    }

    func videoEngine(_ videoEngine: TTVideoEngine,
                     loadStateDidChanged loadState: TTVideoEngineLoadState) {
        DispatchQueue.main.async { [weak self] in
            self?.onLoadStateChanged?(loadState)
        }
    }

    func videoEnginePrepared(_ videoEngine: TTVideoEngine) {
        DispatchQueue.main.async { [weak self] in
            self?.onPrepared?()
        }
    }

    func videoEngineDidFinish(_ videoEngine: TTVideoEngine, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            self?.onFinished?(error)
        }
    }

    // Required no-op stubs
    func videoEngineUserStopped(_ videoEngine: TTVideoEngine) {}
    func videoEngineDidFinish(_ videoEngine: TTVideoEngine, videoStatusException status: Int) {}
    func videoEngineCloseAysncFinish(_ videoEngine: TTVideoEngine) {}
}
