//
//  EnginePlayerView.swift
//  SimplePlayer.TT
//

import SwiftUI

struct EnginePlayerView: UIViewRepresentable {
    let engine: TTVideoEngine

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.backgroundColor = .black
        let pv = engine.playerView
        pv.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(pv)
        NSLayoutConstraint.activate([
            pv.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            pv.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            pv.topAnchor.constraint(equalTo: container.topAnchor),
            pv.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}
