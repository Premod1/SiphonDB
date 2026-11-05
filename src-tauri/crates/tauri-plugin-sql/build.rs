// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

const COMMANDS: &[&str] = &["load", "execute", "select", "close"];

fn main() {
    let mut builder = tauri_plugin::Builder::new(COMMANDS);
    if std::path::Path::new("./api-iife.js").exists() {
        builder = builder.global_api_script_path("./api-iife.js");
    }
    builder.build();
}
