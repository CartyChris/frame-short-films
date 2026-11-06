//! A dependency-free deterministic timeline core shared by native and WASM builds.
use std::sync::Mutex;

pub fn clean_duration(duration: f64) -> f64 {
    if duration.is_finite() && duration > 0.0 {
        duration
    } else {
        0.0
    }
}

/// The final endpoint belongs to the last non-empty scene, preserving its final frame.
pub fn locate_scene(durations: &[f64], time: f64) -> (i32, f64) {
    if durations.is_empty() {
        return (-1, 0.0);
    }
    let time = if time.is_nan() || time < 0.0 {
        0.0
    } else {
        time
    };
    let mut offset = 0.0;
    let mut last = (durations.len() as i32 - 1, 0.0);
    for (index, &duration) in durations.iter().enumerate() {
        let duration = clean_duration(duration);
        if duration > 0.0 {
            last = (index as i32, duration);
            if time < offset + duration {
                return (index as i32, time - offset);
            }
            offset += duration;
        }
    }
    last
}

pub fn ease_in_out(time: f64) -> f64 {
    let t = if time.is_nan() {
        0.0
    } else {
        time.clamp(0.0, 1.0)
    };
    t * t * (3.0 - 2.0 * t)
}

/// FNV-1a checksum detects accidental differences; it is not cryptographic authentication.
pub fn checksum(bytes: &[u8]) -> u32 {
    bytes.iter().fold(0x811c9dc5, |hash, byte| {
        (hash ^ *byte as u32).wrapping_mul(0x01000193)
    })
}

static TIMELINE: Mutex<Vec<f64>> = Mutex::new(Vec::new());
#[no_mangle]
pub extern "C" fn core_version() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn core_ease(time: f64) -> f64 {
    ease_in_out(time)
}
#[no_mangle]
pub extern "C" fn core_timeline_reset() {
    TIMELINE.lock().unwrap().clear();
}
#[no_mangle]
pub extern "C" fn core_timeline_push(duration: f64) {
    TIMELINE.lock().unwrap().push(clean_duration(duration));
}
#[no_mangle]
pub extern "C" fn core_timeline_index(time: f64) -> i32 {
    locate_scene(&TIMELINE.lock().unwrap(), time).0
}
#[no_mangle]
pub extern "C" fn core_timeline_local_time(time: f64) -> f64 {
    locate_scene(&TIMELINE.lock().unwrap(), time).1
}
#[no_mangle]
pub extern "C" fn core_timeline_duration() -> f64 {
    TIMELINE.lock().unwrap().iter().sum()
}
#[no_mangle]
pub extern "C" fn core_checksum_step(hash: u32, byte: u32) -> u32 {
    (hash ^ (byte & 255)).wrapping_mul(0x01000193)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn boundary_and_final_frames() {
        assert_eq!(locate_scene(&[3.0, 5.0, 4.0], 3.0), (1, 0.0));
        assert_eq!(locate_scene(&[3.0, 5.0, 4.0], 12.0), (2, 4.0));
        assert_eq!(locate_scene(&[3.0, 5.0, 4.0], 99.0), (2, 4.0));
    }
    #[test]
    fn empty_malformed_and_negative() {
        assert_eq!(locate_scene(&[], 2.0), (-1, 0.0));
        assert_eq!(
            locate_scene(&[0.0, f64::NAN, -1.0, 5.0, 0.0], -2.0),
            (3, 0.0)
        );
        assert_eq!(
            locate_scene(&[0.0, f64::NAN, -1.0, 5.0, 0.0], f64::INFINITY),
            (3, 5.0)
        );
        assert_eq!(ease_in_out(f64::NAN), 0.0);
        assert_eq!(ease_in_out(-3.0), 0.0);
        assert_eq!(ease_in_out(2.0), 1.0);
    }
    #[test]
    fn long_timeline_is_not_limited_to_shorts() {
        let durations = vec![10.0; 10_000];
        assert_eq!(locate_scene(&durations, 98_765.0), (9876, 5.0));
    }
    #[test]
    fn checksum_known_vector() {
        assert_eq!(checksum(b"hello"), 0x4f9f2cab);
        assert_ne!(checksum(b"partial"), checksum(b"partial output"));
    }
}
