//! Procedural RGBA frame engine for the time generated-media path.
//!
//! Pure rendering lives here so host `rust_test` targets stay free of the
//! browser; `wasm_bindgen` exports wrap the same functions for the web driver.

#![deny(missing_docs)]

use wasm_bindgen::prelude::*;

/// How finely the stopwatch is drawn.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TimerFidelity {
    /// `MM:SS`
    Seconds,
    /// `MM:SS.mmm`
    Milliseconds,
}

impl TimerFidelity {
    /// `0` → seconds, anything else → milliseconds.
    pub fn from_u32(value: u32) -> Self {
        if value == 0 {
            Self::Seconds
        } else {
            Self::Milliseconds
        }
    }
}

/// Metadata describing one rendered frame buffer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FrameHeader {
    /// Pixel width.
    pub width: u32,
    /// Pixel height.
    pub height: u32,
    /// Animation time in milliseconds.
    pub t_ms: u32,
    /// Digit resolution.
    pub fidelity: TimerFidelity,
}

impl FrameHeader {
    /// Byte length of an RGBA8 buffer for this header.
    pub fn byte_len(self) -> usize {
        (self.width as usize)
            .saturating_mul(self.height as usize)
            .saturating_mul(4)
    }
}

/// 5×7 bitmaps for digits `0`–`9` (MSB = left). Crisp block glyphs for a timer.
const DIGIT_GLYPHS: [[u8; 7]; 10] = [
    [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110], // 0
    [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110], // 1
    [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111], // 2
    [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110], // 3
    [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010], // 4
    [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110], // 5
    [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110], // 6
    [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000], // 7
    [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110], // 8
    [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110], // 9
];

/// Colon `:` as a 5×7 glyph (two square dots).
const COLON_GLYPH: [u8; 7] = [0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000];

/// Period `.` as a 5×7 glyph (bottom-center square).
const PERIOD_GLYPH: [u8; 7] = [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100];

/// Render a black timer on a white background into a newly allocated RGBA8 buffer.
///
/// Seconds fidelity is `MM:SS`; milliseconds is `MM:SS.mmm`.
pub fn render_frame(width: u32, height: u32, t_ms: u32) -> Vec<u8> {
    render_frame_ex(width, height, t_ms, TimerFidelity::Seconds)
}

/// Render with an explicit digit resolution.
pub fn render_frame_ex(
    width: u32,
    height: u32,
    t_ms: u32,
    fidelity: TimerFidelity,
) -> Vec<u8> {
    let header = FrameHeader {
        width,
        height,
        t_ms,
        fidelity,
    };
    let mut buf = vec![0u8; header.byte_len()];
    paint_frame(&mut buf, header);
    buf
}

/// Paint into an existing RGBA8 buffer. Panics if `out` is too small.
pub fn paint_frame(out: &mut [u8], header: FrameHeader) {
    assert!(
        out.len() >= header.byte_len(),
        "frame buffer too small: have {} need {}",
        out.len(),
        header.byte_len()
    );

    let w = header.width.max(1) as usize;
    let h = header.height.max(1) as usize;

    // White background.
    for px in out.chunks_exact_mut(4).take(w * h) {
        px[0] = 255;
        px[1] = 255;
        px[2] = 255;
        px[3] = 255;
    }

    let total_secs = header.t_ms / 1000;
    let mins = (total_secs / 60) % 100;
    let secs = total_secs % 60;
    let millis = header.t_ms % 1000;
    let mut chars = [TimerGlyph::Colon; 9];
    chars[0] = TimerGlyph::Digit((mins / 10) as u8);
    chars[1] = TimerGlyph::Digit((mins % 10) as u8);
    chars[2] = TimerGlyph::Colon;
    chars[3] = TimerGlyph::Digit((secs / 10) as u8);
    chars[4] = TimerGlyph::Digit((secs % 10) as u8);
    let n = match header.fidelity {
        TimerFidelity::Seconds => 5,
        TimerFidelity::Milliseconds => {
            chars[5] = TimerGlyph::Period;
            chars[6] = TimerGlyph::Digit((millis / 100) as u8);
            chars[7] = TimerGlyph::Digit(((millis / 10) % 10) as u8);
            chars[8] = TimerGlyph::Digit((millis % 10) as u8);
            9
        }
    };

    // Pick the largest integer scale that fits with padding.
    let glyph_w = 5usize;
    let glyph_h = 7usize;
    let gap = 1usize; // unscaled gap between glyphs
    let content_w = n * glyph_w + (n - 1) * gap;
    let pad = 2usize;
    let scale_x = ((w.saturating_sub(pad * 2)) / content_w).max(1);
    let scale_y = ((h.saturating_sub(pad * 2)) / glyph_h).max(1);
    let scale = scale_x.min(scale_y).max(1);

    let draw_w = content_w * scale;
    let draw_h = glyph_h * scale;
    let origin_x = (w.saturating_sub(draw_w)) / 2;
    let origin_y = (h.saturating_sub(draw_h)) / 2;

    let mut cursor_x = origin_x;
    for glyph in chars.iter().take(n) {
        blit_glyph(out, w, h, cursor_x, origin_y, scale, *glyph);
        cursor_x += (glyph_w + gap) * scale;
    }
}

#[derive(Clone, Copy)]
enum TimerGlyph {
    Digit(u8),
    Colon,
    Period,
}

fn glyph_rows(glyph: TimerGlyph) -> [u8; 7] {
    match glyph {
        TimerGlyph::Digit(d) => DIGIT_GLYPHS[(d as usize).min(9)],
        TimerGlyph::Colon => COLON_GLYPH,
        TimerGlyph::Period => PERIOD_GLYPH,
    }
}

fn blit_glyph(
    out: &mut [u8],
    frame_w: usize,
    frame_h: usize,
    origin_x: usize,
    origin_y: usize,
    scale: usize,
    glyph: TimerGlyph,
) {
    let rows = glyph_rows(glyph);
    for (row_i, row) in rows.iter().enumerate() {
        for col in 0..5usize {
            let bit_on = (row >> (4 - col)) & 1 == 1;
            if !bit_on {
                continue;
            }
            let x0 = origin_x + col * scale;
            let y0 = origin_y + row_i * scale;
            for dy in 0..scale {
                let y = y0 + dy;
                if y >= frame_h {
                    break;
                }
                for dx in 0..scale {
                    let x = x0 + dx;
                    if x >= frame_w {
                        break;
                    }
                    let i = (y * frame_w + x) * 4;
                    out[i] = 0;
                    out[i + 1] = 0;
                    out[i + 2] = 0;
                    out[i + 3] = 255;
                }
            }
        }
    }
}

/// WASM: return RGBA bytes for a frame.
///
/// `fidelity`: `0` = `MM:SS`, `1` = `MM:SS.mmm`.
#[wasm_bindgen(js_name = renderFrame)]
pub fn render_frame_wasm(width: u32, height: u32, t_ms: u32, fidelity: u32) -> Vec<u8> {
    render_frame_ex(width, height, t_ms, TimerFidelity::from_u32(fidelity))
}

/// WASM: byte length helper for JS buffer allocation.
#[wasm_bindgen(js_name = frameByteLen)]
pub fn frame_byte_len(width: u32, height: u32) -> u32 {
    FrameHeader {
        width,
        height,
        t_ms: 0,
        fidelity: TimerFidelity::Seconds,
    }
    .byte_len() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buffer_size_matches_header() {
        let buf = render_frame(64, 48, 0);
        assert_eq!(buf.len(), 64 * 48 * 4);
    }

    #[test]
    fn deterministic_smoke_pixel() {
        let a = render_frame(16, 16, 1000);
        let b = render_frame(16, 16, 1000);
        assert_eq!(a, b);
        // White background (corner pixel).
        assert_eq!(&a[0..4], &[255, 255, 255, 255]);
    }

    #[test]
    fn motion_changes_pixels() {
        let a = render_frame(64, 48, 0);
        let b = render_frame(64, 48, 2500);
        assert_ne!(a, b);
    }

    #[test]
    fn paints_black_ink_somewhere() {
        let buf = render_frame(160, 100, 0);
        let has_black = buf.chunks_exact(4).any(|px| px == [0, 0, 0, 255]);
        assert!(has_black, "expected black timer pixels on white");
    }

    #[test]
    fn seconds_hides_subsecond() {
        let a = render_frame_ex(160, 100, 0, TimerFidelity::Seconds);
        let b = render_frame_ex(160, 100, 999, TimerFidelity::Seconds);
        assert_eq!(a, b);
        let c = render_frame_ex(160, 100, 0, TimerFidelity::Milliseconds);
        let d = render_frame_ex(160, 100, 999, TimerFidelity::Milliseconds);
        assert_ne!(c, d);
        assert_ne!(a, c);
    }
}
