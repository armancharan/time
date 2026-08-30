"""Custom rule: hermetic Playwright contract for the generated media path.

Runs Playwright against a served web build that includes the WASM frame engine.
Fails unless Start yields a live <video> with a MediaStream srcObject.
"""

load("@rules_shell//shell:sh_test.bzl", "sh_test")

def media_stream_e2e(name, data = [], tags = [], visibility = None):
    """Wrap the repo Playwright suite as a Bazel test.

    Args:
      name: Test target name.
      data: Extra runfiles (web dist, wasm artifacts, etc.).
      tags: Bazel tags (e.g. ["requires-network"] if needed).
      visibility: Standard Bazel visibility.
    """
    sh_test(
        name = name,
        srcs = ["//e2e:run_media_stream_e2e.sh"],
        data = data + [
            "//apps/web:web_files",
            "//crates/frame_engine:frame_engine_web_files",
            "//e2e:playwright_files",
        ],
        tags = tags + ["e2e", "exclusive", "local"],
        size = "large",
        timeout = "long",
        visibility = visibility if visibility != None else ["//visibility:public"],
    )
