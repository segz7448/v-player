package com.matthew.videoplayerapp.equalizer

import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

/**
 * AudioEqualizerModule
 *
 * Wraps Android's platform `Equalizer` and `LoudnessEnhancer` audio effects.
 *
 * IMPORTANT CONSTRAINT: react-native-video (v6, as used by this app) does
 * not expose ExoPlayer's per-instance audio session id to JS — there is no
 * `onAudioSessionId` callback or `audioSessionId` prop in its public API.
 * Because of that, this module cannot target *only* this app's video
 * player the way a fully custom ExoPlayer integration could.
 *
 * Instead, `attach()` is called with Android's global output session id,
 * `0` (AudioManager.AUDIO_SESSION_ID_GENERATE is NOT used here on purpose —
 * session 0 is the well-documented "attach to the whole mix" session).
 * ExoPlayer does not set an explicit session id unless told to, so by
 * default its output lands in session 0 and these effects apply to it
 * correctly. The tradeoff: the EQ/boost will affect *all* audio the app
 * plays through the default session, not just the current video. For a
 * single-player video app like this one that's the same thing in
 * practice, but it's worth knowing if another audio source is ever added.
 *
 * If a future react-native-video release adds session id reporting, swap
 * the hardcoded 0 for the real id and this module's API doesn't need to
 * change on the JS side.
 *
 * - Equalizer: standard 5(+)-band platform EQ. Band count/frequency ranges
 *   are hardware/OEM-dependent, so we query the device for its actual band
 *   layout rather than assuming a fixed 5-band layout, and report that
 *   layout back to JS to render the right number of sliders.
 * - LoudnessEnhancer: provides gain *beyond* 100% ("audio boost"), which a
 *   plain Equalizer cannot do since EQ bands can only attenuate/boost
 *   within the codec's existing headroom. Values are in millibels; we
 *   expose a simpler 0-2000 "boost" range (0 = off, 2000 = +20dB) to JS.
 */
class AudioEqualizerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var equalizer: Equalizer? = null
  private var loudnessEnhancer: LoudnessEnhancer? = null
  private var attachedSessionId: Int = -1

  override fun getName(): String = "AudioEqualizerModule"

  /**
   * Attach (or re-attach) the effect chain to Android's global output
   * session (session id 0), which is where ExoPlayer's audio lands by
   * default when react-native-video doesn't supply an explicit session id
   * (see the class doc above for why). Safe to call multiple times, e.g.
   * on screen focus — if already attached this is a cheap no-op that just
   * returns current state.
   */
  @ReactMethod
  fun attach(promise: Promise) {
    try {
      if (equalizer != null && attachedSessionId == GLOBAL_SESSION_ID) {
        promise.resolve(describeCurrentState())
        return
      }

      releaseInternal()

      val eq = Equalizer(0, GLOBAL_SESSION_ID)
      eq.enabled = true
      equalizer = eq

      val loudness = LoudnessEnhancer(GLOBAL_SESSION_ID)
      loudness.setTargetGain(0)
      loudness.enabled = false
      loudnessEnhancer = loudness

      attachedSessionId = GLOBAL_SESSION_ID
      promise.resolve(describeCurrentState())
    } catch (e: Exception) {
      promise.reject("EQ_ATTACH_FAILED", "Could not attach audio effects: ${e.message}", e)
    }
  }

  /** Returns band layout + current level per band, and current boost value. */
  private fun describeCurrentState(): WritableMap {
    val result = Arguments.createMap()
    val eq = equalizer

    if (eq == null) {
      result.putArray("bands", Arguments.createArray())
      result.putInt("boost", 0)
      result.putInt("maxBoost", MAX_BOOST_MILLIBEL)
      return result
    }

    val bands: WritableArray = Arguments.createArray()
    val bandCount = eq.numberOfBands
    val levelRange = eq.bandLevelRange // [minMillibel, maxMillibel]

    for (i in 0 until bandCount) {
      val bandId = i.toShort()
      val band = Arguments.createMap()
      band.putInt("index", i)
      band.putInt("centerFreqHz", eq.getCenterFreq(bandId) / 1000) // milliHz -> Hz
      band.putInt("levelMillibel", eq.getBandLevel(bandId).toInt())
      band.putInt("minMillibel", levelRange[0].toInt())
      band.putInt("maxMillibel", levelRange[1].toInt())
      bands.pushMap(band)
    }

    result.putArray("bands", bands)
    result.putInt("boost", loudnessEnhancer?.targetGain?.toInt() ?: 0)
    result.putInt("maxBoost", MAX_BOOST_MILLIBEL)
    return result
  }

  @ReactMethod
  fun getState(promise: Promise) {
    promise.resolve(describeCurrentState())
  }

  @ReactMethod
  fun setBandLevel(bandIndex: Double, levelMillibel: Double, promise: Promise) {
    val eq = equalizer
    if (eq == null) {
      promise.reject("EQ_NOT_ATTACHED", "Call attach() first.")
      return
    }
    try {
      eq.setBandLevel(bandIndex.toInt().toShort(), levelMillibel.toInt().toShort())
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("EQ_SET_BAND_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun setEnabled(enabled: Boolean, promise: Promise) {
    val eq = equalizer
    if (eq == null) {
      promise.reject("EQ_NOT_ATTACHED", "Call attach() first.")
      return
    }
    eq.enabled = enabled
    promise.resolve(true)
  }

  /**
   * Applies one of a small set of built-in curves by writing band levels
   * directly, rather than relying on device-specific presets (Equalizer's
   * own getPreset()/usePreset() presets vary wildly by OEM and are often
   * missing entirely on modern Android). "flat" resets all bands to 0.
   */
  @ReactMethod
  fun applyPreset(presetName: String, promise: Promise) {
    val eq = equalizer
    if (eq == null) {
      promise.reject("EQ_NOT_ATTACHED", "Call attach() first.")
      return
    }
    try {
      val bandCount = eq.numberOfBands.toInt()
      val curve = PRESET_CURVES[presetName] ?: FloatArray(bandCount) { 0f }
      for (i in 0 until bandCount) {
        val range = eq.bandLevelRange
        val fraction = curve.getOrElse(i) { 0f }
        val level = (fraction * range[1]).toInt().toShort()
        eq.setBandLevel(i.toShort(), level)
      }
      promise.resolve(describeCurrentState())
    } catch (e: Exception) {
      promise.reject("EQ_PRESET_FAILED", e.message, e)
    }
  }

  /**
   * Sets audio boost ("gain beyond 100%") in millibels, 0-2000 (0-20dB).
   * Backed by LoudnessEnhancer, which is a distinct effect from the EQ —
   * this is genuine post-gain amplification, not just raising all EQ
   * bands (which cannot exceed the codec's existing peak headroom).
   */
  @ReactMethod
  fun setBoost(millibel: Double, promise: Promise) {
    val loudness = loudnessEnhancer
    if (loudness == null) {
      promise.reject("EQ_NOT_ATTACHED", "Call attach() first.")
      return
    }
    try {
      val clamped = millibel.toFloat().coerceIn(0f, MAX_BOOST_MILLIBEL.toFloat())
      loudness.enabled = clamped > 0f
      loudness.setTargetGain(clamped.toInt())
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("EQ_BOOST_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun release(promise: Promise) {
    releaseInternal()
    promise.resolve(true)
  }

  private fun releaseInternal() {
    try {
      equalizer?.release()
    } catch (_: Exception) {
    }
    try {
      loudnessEnhancer?.release()
    } catch (_: Exception) {
    }
    equalizer = null
    loudnessEnhancer = null
    attachedSessionId = -1
  }

  override fun onCatalystInstanceDestroy() {
    super.onCatalystInstanceDestroy()
    releaseInternal()
  }

  companion object {
    const val GLOBAL_SESSION_ID = 0 // Android's default/global output mix session
    const val MAX_BOOST_MILLIBEL = 2000 // +20dB ceiling; LoudnessEnhancer can clip louder than this

    // Fractions of each band's max level, roughly shaped curves. Applied
    // proportionally to whatever band range the device actually reports.
    val PRESET_CURVES = mapOf(
      "flat" to floatArrayOf(0f, 0f, 0f, 0f, 0f),
      "bass_boost" to floatArrayOf(0.9f, 0.6f, 0.1f, -0.1f, -0.1f),
      "vocal_boost" to floatArrayOf(-0.2f, 0.1f, 0.6f, 0.5f, 0.1f),
      "treble_boost" to floatArrayOf(-0.1f, -0.1f, 0.1f, 0.5f, 0.9f)
    )
  }
}
