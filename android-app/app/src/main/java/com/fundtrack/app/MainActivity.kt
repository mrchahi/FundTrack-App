package com.fundtrack.app

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null

    private val prefs by lazy {
        getSharedPreferences("fundtrack_android_prefs", Context.MODE_PRIVATE)
    }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = fileUploadCallback
        fileUploadCallback = null
        if (callback == null) return@registerForActivityResult
        if (result.resultCode == RESULT_OK) {
            val uri = result.data?.data
            callback.onReceiveValue(if (uri != null) arrayOf(uri) else emptyArray())
        } else {
            callback.onReceiveValue(null)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = Color.parseColor("#090D14")
        window.navigationBarColor = Color.parseColor("#090D14")

        val container = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#090D14"))
        }

        swipeRefresh = SwipeRefreshLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#090D14"))
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback
                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                return try {
                    fileChooserLauncher.launch(intent)
                    true
                } catch (_: Exception) {
                    fileUploadCallback = null
                    false
                }
            }

            // Handle Google OAuth Sign-In popups cleanly in system browser or modal WebView
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message?
            ): Boolean {
                val href = view?.hitTestResult?.extra
                if (!href.isNullOrBlank()) {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(href)))
                    return false
                }
                val popupWebView = WebView(this@MainActivity).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                }
                val dialog = AlertDialog.Builder(this@MainActivity)
                    .setView(popupWebView)
                    .setNegativeButton("Close") { d, _ ->
                        popupWebView.destroy()
                        d.dismiss()
                    }
                    .create()
                popupWebView.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(v: WebView?, url: String?) {
                        if (url != null && url.contains("/__/auth/handler")) {
                            // Firebase popup auth completes automatically via postMessage
                        }
                    }
                }
                val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
                transport.webView = popupWebView
                resultMsg.sendToTarget()
                dialog.show()
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    swipeRefresh.isRefreshing = false
                    showLanConfigDialog(isErrorPrompt = true)
                }
            }
        }

        webView.setDownloadListener(DownloadListener { url, _, _, _, _ ->
            if (url.startsWith("http://") || url.startsWith("https://")) {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            } else {
                Toast.makeText(
                    this,
                    "Export triggered — use System > Backup JSON or Share in browser if needed.",
                    Toast.LENGTH_SHORT
                ).show()
            }
        })

        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }
        swipeRefresh.addView(webView)
        container.addView(swipeRefresh)
        setContentView(container)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        val currentUrl = getSavedServerUrl()
        webView.loadUrl(currentUrl)
    }

    private fun getSavedServerUrl(): String {
        val defaultUrl = getString(R.string.default_server_url)
        return prefs.getString("server_url", defaultUrl)?.takeIf { it.isNotBlank() } ?: defaultUrl
    }

    private fun showLanConfigDialog(isErrorPrompt: Boolean = false) {
        val input = EditText(this).apply {
            setText(getSavedServerUrl())
            hint = "http://192.168.1.100:3000"
        }
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (20 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad / 2, pad, pad / 2)
            addView(input)
        }

        val title = if (isErrorPrompt) {
            "اتصال به سرور LAN برقرار نشد"
        } else {
            "آدرس سرور FundTrack (LAN / Cloud)"
        }
        val msg = if (isErrorPrompt) {
            "آدرس سرور داخلی (LAN) یا لینک ابری برنامه را وارد کنید:"
        } else {
            "آدرس شبکه داخلی کامپیوتر (مثال: http://192.168.1.100:3000) یا آدرس HTTPS برنامه را تنظیم کنید:"
        }

        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(msg)
            .setView(box)
            .setPositiveButton("اتصال و ذخیره") { _, _ ->
                val url = input.text.toString().trim().trimEnd('/')
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    prefs.edit().putString("server_url", url).apply()
                    webView.loadUrl(url)
                } else {
                    Toast.makeText(this, "آدرس باید با http:// یا https:// شروع شود", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("تلاش مجدد") { _, _ ->
                webView.reload()
            }
            .setCancelable(true)
            .show()
    }
}
