package com.maudconnect.diagnostics

import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Records WHY the app froze, from outside the frozen part.
 *
 * Real failure: some mornings every start froze right after the first screen
 * appeared, until a reinstall, and left nothing in the Diagnostics log — that
 * log (like everything else the JS side saves) goes through the JS thread and
 * then the native-modules thread, and one of the two was what had stopped.
 *
 * While the app is on screen, a separate thread checks every 2 s that the JS
 * thread and the native-modules thread still answer. When one hasn't answered
 * for 8 s (and again at 60 s) it writes the stack traces of the JS, native-
 * modules and main threads, plus the last steps the JS side noted (startup
 * checkpoints, Redux actions, Diagnostics lines), to a file. The next start
 * moves that file into the Diagnostics log (src/services/hangWatchdog.ts).
 */
class HangWatchdogModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  override fun getName(): String = "MaudHangWatchdog"

  private class Target(val label: String, val threadNames: List<String>, val post: (Runnable) -> Boolean) {
    // uptime when the unanswered check was posted; 0 = none outstanding.
    var postedAt = 0L
    var reportsWritten = 0
  }

  private val lock = Any()
  private val targets = listOf(
    Target("JS thread", listOf("mqt_v_js", "mqt_js")) { reactApplicationContext.runOnJSQueueThread(it) },
    Target("native modules thread", listOf("mqt_v_native", "mqt_native_modules")) {
      reactApplicationContext.runOnNativeModulesQueueThread(it)
      true
    },
  )
  private val crumbs = ArrayDeque<String>()
  private var handler: Handler? = null
  private var onScreen = true

  private val tick = object : Runnable {
    override fun run() {
      val keepGoing = synchronized(lock) { checkTargets() }
      if (keepGoing) handler?.postDelayed(this, TICK_MS)
    }
  }

  // Called by JS as early as possible on each UI start.
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun install(): Boolean {
    synchronized(lock) {
      if (handler == null) {
        val thread = HandlerThread("maud-hang-watchdog").apply { start() }
        handler = Handler(thread.looper)
        reactApplicationContext.addLifecycleEventListener(this)
      }
      restartTicking()
    }
    return true
  }

  // Runs ON the JS thread and only touches memory, so it still works when the
  // native-modules thread is the one that hangs.
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun note(text: String): Boolean {
    val line = "${clock.format(Date())} ${text.take(MAX_CRUMB_CHARS)}"
    synchronized(crumbs) {
      crumbs.addLast(line)
      while (crumbs.size > MAX_CRUMBS) crumbs.removeFirst()
    }
    return true
  }

  // Reports written by an earlier run, oldest first; the file is removed.
  @ReactMethod
  fun takeReports(promise: Promise) {
    try {
      val file = reportFile()
      if (!file.exists()) {
        promise.resolve(null)
        return
      }
      val text = file.readText()
      file.delete()
      promise.resolve(text.ifBlank { null })
    } catch (e: Exception) {
      promise.resolve(null)
    }
  }

  override fun onHostResume() {
    synchronized(lock) {
      onScreen = true
      restartTicking()
    }
  }

  override fun onHostPause() {
    synchronized(lock) { onScreen = false }
  }

  override fun onHostDestroy() {
    synchronized(lock) { onScreen = false }
  }

  private fun restartTicking() {
    val h = handler ?: return
    h.removeCallbacks(tick)
    h.post(tick)
  }

  // Returns whether to keep checking: off screen, only until outstanding
  // checks are answered or fully reported (JS timers stop off screen anyway,
  // and this must not wake the phone all night).
  private fun checkTargets(): Boolean {
    val now = SystemClock.uptimeMillis()
    var outstanding = false
    for (t in targets) {
      if (t.postedAt == 0L) {
        if (!onScreen) continue
        t.postedAt = now
        t.reportsWritten = 0
        val posted = try {
          t.post(Runnable { answered(t) })
        } catch (e: Exception) {
          false
        }
        if (!posted) t.postedAt = 0L else outstanding = true
        continue
      }
      outstanding = true
      val waited = now - t.postedAt
      if ((t.reportsWritten == 0 && waited >= FIRST_REPORT_MS) || (t.reportsWritten == 1 && waited >= SECOND_REPORT_MS)) {
        t.reportsWritten++
        writeReport(t, waited)
      }
      if (t.reportsWritten >= 2 && !onScreen) t.postedAt = 0L
    }
    return onScreen || outstanding
  }

  private fun answered(t: Target) {
    synchronized(lock) {
      if (t.postedAt == 0L) return
      val waited = SystemClock.uptimeMillis() - t.postedAt
      if (t.reportsWritten > 0) {
        append("=== ${t.label} answered again after ${seconds(waited)} (${stamp.format(Date())}) ===\n")
      }
      t.postedAt = 0L
      t.reportsWritten = 0
    }
  }

  private fun writeReport(stuck: Target, waitedMs: Long) {
    val out = StringBuilder()
    out.append("=== App froze: ${stuck.label} did not respond for ${seconds(waitedMs)} ")
      .append("(${stamp.format(Date())}, ${if (onScreen) "app on screen" else "app in background"}) ===\n")
    out.append("Last steps noted by the app (newest last):\n")
    synchronized(crumbs) { crumbs.forEach { out.append("  ").append(it).append('\n') } }
    val stacks = try {
      Thread.getAllStackTraces()
    } catch (e: Exception) {
      emptyMap()
    }
    val wanted = targets.map { it.label to it.threadNames } + ("main thread" to listOf("main"))
    for ((label, names) in wanted) {
      val entry = stacks.entries.firstOrNull { it.key.name in names }
      if (entry == null) {
        out.append("$label: not found\n")
        continue
      }
      out.append("$label (${entry.key.name}, ${entry.key.state}):\n")
      entry.value.take(MAX_FRAMES).forEach { out.append("    at ").append(it).append('\n') }
      if (entry.value.size > MAX_FRAMES) out.append("    … ${entry.value.size - MAX_FRAMES} more\n")
    }
    append(out.toString())
  }

  private fun append(text: String) {
    try {
      val file = reportFile()
      val previous = if (file.exists()) file.readText() else ""
      file.writeText((previous + text).takeLast(MAX_FILE_CHARS))
    } catch (e: Exception) {
      // Nowhere else to record it.
    }
  }

  private fun reportFile() = File(reactApplicationContext.filesDir, "maud-hang-reports.txt")

  private fun seconds(ms: Long) = String.format(Locale.US, "%.1f s", ms / 1000.0)

  private val clock = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)
  private val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss Z", Locale.US)

  companion object {
    private const val TICK_MS = 2_000L
    private const val FIRST_REPORT_MS = 8_000L
    private const val SECOND_REPORT_MS = 60_000L
    private const val MAX_CRUMBS = 40
    private const val MAX_CRUMB_CHARS = 160
    private const val MAX_FRAMES = 30
    private const val MAX_FILE_CHARS = 30_000
  }
}
