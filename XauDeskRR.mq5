//+------------------------------------------------------------------+
//|                                                 XauDeskRR.mq5 |
//|  Manual trade panel for DEMO / LIVE charts                        |
//|  v5.00                                                            |
//|                                                                   |
//|  Two dashboards:                                                  |
//|   - CONTROL (left): order type, size, TP, note, EXECUTE,          |
//|     trade management (close / cancel / breakeven / reduce)        |
//|   - INFO (right): plan, open trades, account, journal, status     |
//|                                                                   |
//|  - Direction is dynamic (SL below entry = BUY, above = SELL)      |
//|  - Pending type is automatic (entry ahead of price = STOP,        |
//|    entry behind price = LIMIT)                                    |
//|  - TP from R:R or from profit % of balance                        |
//|  - Total volume split into N orders (min lot / step aware)        |
//|  - Separate entry line per order, one shared SL line              |
//|  - Settings, plan lines, open-trade data and the journal survive  |
//|    restarts (global variables + files in Common\Files)            |
//+------------------------------------------------------------------+
#property version   "6.00"
#property description "XauDesk RR 6.00 - cyberpunk neon dashboard (dark / light), manual trading, RSI instruments, persistent journal"

#include <Trade/Trade.mqh>

#define MAXN 32

enum ENUM_CHART_SCHEME
{
   CS_OFF   = 0,   // leave the chart colours alone
   CS_THEME = 1    // chart colours follow the panel theme
};

enum ENUM_JOURNAL_PERIOD
{
   JP_ALL   = 0,   // never reset
   JP_DAY   = 1,   // new journal every day
   JP_WEEK  = 2,   // new journal every week (starts Monday)
   JP_MONTH = 3    // new journal every month
};

enum ENUM_SCALE_ORDER
{
   SCALE_PROFIT_FIRST = 0,  // Most profitable positions first (bank profit)
   SCALE_LOSS_FIRST   = 1   // Most losing positions first (cut risk)
};

//--- inputs

input group "=== Levels (set before a test run, 0 = off) ==="
input double InpEntryPrice      = 0;      // Entry level 1 (price). Moves the whole ladder with STEP
input double InpSLPrice         = 0;      // Stop loss (price)
input int    InpKeyStep        = 10;     // Keys: points moved per arrow press (S = SL, E = entries, ESC = off)

input group "=== Strategy ==="
input int    InpGridStepPts    = 100;    // Grid: distance between levels (points)
input string InpGridWeights    = "1,2,3"; // Grid: share of the total volume per level, E1 first (1,2,3 = 1:2:3)
input double InpBasketUSD      = 0;      // Basket: close everything when floating profit reaches this (USD, 0 = off)

input group "=== Volume ==="
input double InpVolume          = 0.10;   // Total volume (lots), split across the orders
input double InpRiskPercent     = 1.0;    // Default risk % of balance (risk mode)
input bool   InpStartInRiskMode = false;  // Start in risk % mode

input group "=== Orders / TP ==="
input int    InpOrders          = 1;      // Default number of orders
input int    InpMaxOrders       = 10;     // Max number of orders (up to 32)
input double InpRR              = 2.0;    // Default R:R (TP = R x SL distance)
input double InpProfitPercent   = 1.0;    // Default profit target, % of balance
input bool   InpStartProfitMode = false;  // Start in "profit %" TP mode
input bool   InpStartPending    = false;  // Start in pending mode
input int    InpDefaultSLPts    = 500;    // Default SL distance (points)
input double InpSLPercent       = 0.5;    // Default SL distance (% of price)
input bool   InpStartSLPct      = false;  // Start with SL in % mode
input int    InpEntryStepPts    = 100;    // Spacing of pending entry lines (points)
input long   InpMagic           = 77310;  // Magic number
input bool   InpAcceptAnyMagic  = false;  // Treat every open position on this symbol as ours (any magic)
input int    InpDeviation       = 30;     // Max deviation (points)
input int    InpMaxSpreadPts    = 0;      // Block market EXECUTE when spread is above this (points, 0 = off)

input group "=== Reduce volume ==="
input double InpReduceP1        = 15;     // Reduce button 1 (% of open volume)
input double InpReduceP2        = 25;     // Reduce button 2 (%)
input double InpReduceP3        = 50;     // Reduce button 3 (%)
input double InpReduceP4        = 75;     // Reduce button 4 (%)
input ENUM_SCALE_ORDER InpScaleOutOrder = SCALE_PROFIT_FIRST; // Which positions to close first

input group "=== Panel ==="
input int    InpPanelX          = 16;     // Control panel X
input int    InpPanelY          = 24;     // Control panel Y
input int    InpInfoX           = -1;     // Info panel X (-1 = right next to the control panel)
input int    InpInfoY           = -1;     // Info panel Y (-1 = same as control panel)
input bool   InpDarkTheme       = true;   // Start with the dark theme
input int    InpSpreadWarnPts   = 0;      // Highlight spread above this (points, 0 = off)
input double InpUsdToman        = 0;      // Dollar price in Toman (0 = off). Assumes a USD account
input bool   InpRemember        = true;   // Remember settings / plan lines between restarts

input bool   InpResetLayout    = false;  // Ignore saved panel positions (drag again after this)
const bool InpCtlHorizontal = true;      // the bottom dashboard is always the horizontal strip
input bool   InpCtlAtBottom    = true;   // Horizontal strip at the bottom of the chart (false = top)
input int    InpUIScale        = 0;      // Dashboard size in % (0 = automatic from chart height)

input group "=== Info sections (what to show) ==="
input bool   InpShowWeek        = true;   // Week chart: daily PnL bars
input bool   InpShowTrades      = true;   // Open trades
input bool   InpShowAccount     = true;   // Balance / equity
input bool   InpShowJournal     = true;   // Journal stats and file path
input bool   InpShowStatus      = true;   // Last action / status

input group "=== Appearance ==="
input string InpCtlFont         = "Segoe UI"; // Control panel font (must be installed)
input int    InpCtlFontScale    = 100;    // Control panel font size, % of default (50 - 200)
input string InpInfoFont        = "Segoe UI"; // Info panel font (must be installed)
input int    InpInfoFontScale   = 100;    // Info panel font size, % of default (50 - 200)
input color  InpSLColor         = C'255,43,214';  // SL line colour (neon magenta)
input color  InpTPColor         = C'0,229,255';   // TP line colour (neon cyan)
input color  InpEntryColor      = C'190,120,255'; // Entry line colour (neon violet)
input ENUM_LINE_STYLE InpLineStyle = STYLE_DASH;  // Line style for SL / TP / Entry
input int    InpTagFontSize     = 12;     // Font size of the price tags on the lines (pt, 6 - 30)
input int    InpTagPad          = 14;     // Inner padding left / right of the price tag text (px)
input int    InpTagDX           = 0;      // Fine tuning: move the tag text right (+) / left (-) (px)
input int    InpTagDY           = 0;      // Fine tuning: move the tag text down (+) / up (-) (px)
input int    InpLineWidth       = 1;      // Line width of the SL / Entry lines (1 - 5)

input group "=== Chart ==="
input ENUM_CHART_SCHEME InpChartScheme = CS_THEME; // Chart colours follow the theme (or off)

input group "=== Tools ==="
input datetime InpPnlSince     = D'2026.07.23 00:00'; // Week card: PnL counted from this date

// input group "=== AUTO (RSI) ==="
const bool   InpAutoRsiGrid      = false;  // RSI grid: orders added at RSI levels (false = all orders at once)
const bool   InpAutoLiveEntry    = false;  // true = enter as soon as current RSI enters the zone; false = use closed-bar signal
const int    InpAutoRsiPeriod    = 14;     // RSI period
const int    InpAutoSell         = 70;     // SELL when RSI crosses up through this (also closes longs)
const int    InpAutoBuy          = 30;     // BUY when RSI crosses down through this (also closes shorts)
const int    InpAutoStep         = 10;     // RSI grid: RSI points between orders
const int    InpAutoSLSell       = 100;    // RSI stop for shorts (all closed when RSI reaches it)
const int    InpAutoSLBuy        = 0;      // RSI stop for longs (all closed when RSI reaches it)

// input group "=== RSI (left gauge zones) ==="
const int    InpRsi1BuyMin  = 0;   // left gauge BUY zone minimum
const int    InpRsi1BuyMax  = 30;  // left gauge BUY zone maximum
const int    InpRsi1SellMin = 70;  // left gauge SELL zone minimum
const int    InpRsi1SellMax = 100; // left gauge SELL zone maximum

input group "=== ATR gauge ==="
input bool           InpAtrShow = true;          // show the ATR gauge on the right stack
input ENUM_TIMEFRAMES InpAtrTf  = PERIOD_M1;     // ATR timeframe (closed candle)
input int            InpAtrPeriod = 14;          // ATR period
input int            InpAtrBase   = 100;         // baseline: SMA of ATR over this many closed candles

// input group "=== RSI (right gauge) ==="
const ENUM_TIMEFRAMES InpRsi2Tf     = PERIOD_H1; // timeframe of the right RSI
const int             InpRsi2Period = 14;        // period of the right RSI
const int             InpRsi2BuyLowMin  = 0;   // lower BUY zone: minimum RSI
const int             InpRsi2BuyLowMax  = 20;  // lower BUY zone: maximum RSI
const int             InpRsi2SellMin    = 35;  // inner SELL zone: minimum RSI
const int             InpRsi2SellMax    = 45;  // inner SELL zone: maximum RSI
const int             InpRsi2BuyMin     = 55;  // inner BUY zone: minimum RSI
const int             InpRsi2BuyMax     = 65;  // inner BUY zone: maximum RSI
const int             InpRsi2SellHighMin= 80;  // upper SELL zone: minimum RSI
const int             InpRsi2SellHighMax= 100; // upper SELL zone: maximum RSI

// input group "=== RSI (third gauge, independent) ==="
const ENUM_TIMEFRAMES InpRsi3Tf = PERIOD_M15;
const int InpRsi3Period = 14;
const int InpRsi3BuyLowMin = 0;
const int InpRsi3BuyLowMax = 20;
const int InpRsi3SellMin = 35;
const int InpRsi3SellMax = 45;
const int InpRsi3BuyMin = 55;
const int InpRsi3BuyMax = 65;
const int InpRsi3SellHighMin = 80;
const int InpRsi3SellHighMax = 100;

// radar is removed: its settings are fixed here
#define InpShowRadar      false
#define InpRadarThreshold 5
#define InpRadarAlert     false
#define InpReactMinTF     2
#define InpReactMaxATR    0.0
#define InpJumpMult       1.5
#define InpRadarX         8
#define InpRadarY         24
#define InpCorrPos        ""
#define InpCorrNeg        ""

// input group "=== Levels ==="
const int    InpLevelBars       = 40;     // Levels: how many bars back to look for breaks

// input group "=== Market radar ==="
input bool   InpRadar       = true;                    // Send market radar lines (M1, M15, H1, H4) to the dashboard

input group "=== Data for FundTrack dashboard ==="
const bool   InpFtEvents     = true;                    // Write account, position and deal events for the dashboard
const string InpBackfillFrom = "2026.07.23";            // Import deal history from this server date (once per account)

input group "=== Journal ==="
// CSV folder: Terminal > Common > Files > XauDesk (also printed in the Experts tab)
input bool   InpAutoSave        = true;   // Save the journal CSV after every closed trade
input ENUM_JOURNAL_PERIOD InpJournalPeriod = JP_DAY; // Journal starts fresh at each period
input bool   InpJournalManual   = true;   // Also journal trades placed by hand in the terminal (this symbol)
input bool   InpDebug           = false;  // Print button clicks to the Experts tab

//--- theme colours (filled by ApplyTheme)
color g_bg, g_card, g_border, g_input, g_text, g_muted, g_accent;
color g_btn, g_btnOn, g_onText, g_buy, g_sell, g_warn;
color g_dangerBg, g_dangerFg, g_amberBg, g_amberFg;
int   g_theme = 0;   // 0 dark, 1 light, 2 autumn, 3 ocean (click the theme button to change)
color c_bg, c_fg, c_up, c_dn, c_grid;   // chart colours of the current theme

//--- fixed line colours (same on both themes)


//--- geometry (8 px grid)
const int PW   = 240;   // both panels: width  = 35 x 8
const int PH_C = 552;   // control panel height = 68 x 8
const int PH_I = 608;   // info panel height    = 59 x 8

//--- control panel objects (prefix BT_c_)
const string C_BG       = "BT_c_bg";
const string C_TITLE    = "BT_c_title";
const string C_CSV      = "BT_c_csv";
const string C_LINES    = "BT_c_lines";
const string C_RRV      = "BT_c_rrv";      // R:R readout
const string C_PFV      = "BT_c_pfv";      // profit readout
const string C_THEME    = "BT_c_theme";
const string C_AUTO = "BT_c_auto";
const string C_RSIDASH = "BT_c_rsidash";
const string C_ARP_M = "BT_c_arpm", C_ARP_P = "BT_c_arpp", C_ARP_V = "BT_c_arpv";
const string C_AHI_M = "BT_c_ahim", C_AHI_P = "BT_c_ahip", C_AHI_V = "BT_c_ahiv";
const string C_ALO_M = "BT_c_alom", C_ALO_P = "BT_c_alop", C_ALO_V = "BT_c_alov";
const string C_BMIN_M="BT_c_bminm", C_BMIN_P="BT_c_bminp", C_BMIN_V="BT_c_bminv";
const string C_BMAX_M="BT_c_bmaxm", C_BMAX_P="BT_c_bmaxp", C_BMAX_V="BT_c_bmaxv";
const string C_SMIN_M="BT_c_sminm", C_SMIN_P="BT_c_sminp", C_SMIN_V="BT_c_sminv";
const string C_SMAX_M="BT_c_smaxm", C_SMAX_P="BT_c_smaxp", C_SMAX_V="BT_c_smaxv";
const string C_AST = "BT_c_ast";
const string C_ASTART = "BT_c_astart";
const string C_ASTP_M = "BT_c_astpm", C_ASTP_P = "BT_c_astpp", C_ASTP_V = "BT_c_astpv";
const string C_ASS_M = "BT_c_assm", C_ASS_P = "BT_c_assp", C_ASS_V = "BT_c_assv";
const string C_ASB_M = "BT_c_asbm", C_ASB_P = "BT_c_asbp", C_ASB_V = "BT_c_asbv";
const string C_FOLD     = "BT_c_fold";
const string C_PRIV     = "BT_c_priv";
const string C_GRID     = "BT_c_grid";
const string C_STEP     = "BT_c_step";
const string C_WGT      = "BT_c_wgt";
const string C_W1       = "BT_c_w1";
const string C_W2       = "BT_c_w2";
const string C_W3       = "BT_c_w3";
const string C_BTP      = "BT_c_btp";
const string C_CAPSTR   = "BT_c_capstr";
const string C_CAPWGT   = "BT_c_capwgt";
const string C_CAPBTP   = "BT_c_capbtp";
const string C_HINT     = "BT_c_hint";
const string C_CARD1    = "BT_c_card1";
const string C_MKT      = "BT_c_mkt";
const string C_PEND     = "BT_c_pend";
const string C_LOT      = "BT_c_lot";
const string C_RISK     = "BT_c_risk";
const string C_RRM      = "BT_c_rrmode";
const string C_PCT      = "BT_c_pctmode";
const string C_CARD2    = "BT_c_card2";
const string C_CAPVOL   = "BT_c_capvol";
const string C_CAPN     = "BT_c_capn";
const string C_VMINUS   = "BT_c_vminus";
const string C_VOL      = "BT_c_vol";
const string C_VPLUS    = "BT_c_vplus";
const string C_NMINUS   = "BT_c_nminus";
const string C_N        = "BT_c_n";
const string C_NPLUS    = "BT_c_nplus";
const string C_TP       = "BT_c_tp";
const string C_CAPSL    = "BT_c_capsl";
const string C_CAPTP    = "BT_c_captp";
const string C_SLV      = "BT_c_slv";
const string C_SLPTS    = "BT_c_slpts";
const string C_SLPCT    = "BT_c_slpct";
const string C_SLRSI    = "BT_c_slrsi";
const string C_Q1       = "BT_c_q1";
const string C_Q2       = "BT_c_q2";
const string C_Q3       = "BT_c_q3";
const string C_CAPNOTE  = "BT_c_capnote";
const string C_NOTE     = "BT_c_note";
const string C_DUAL     = "BT_c_dual";
const string C_HEDGE    = "BT_c_hedge";
const string C_EXEC     = "BT_c_exec";
const string C_CARD3    = "BT_i_mgcard";
const string C_CLOSEALL = "BT_m_close";
const string C_CANCEL   = "BT_m_cancel";
const string C_BEON     = "BT_m_be";
const string C_BEOFF    = "BT_i_mgbeoff"; // retained for legacy object cleanup
const string C_R1       = "BT_m_r1";
const string C_R2       = "BT_m_r2";
const string C_R3       = "BT_m_r3";
const string C_R4       = "BT_m_r4";

//--- info panel objects (prefix BT_i_)
const string I_BG       = "BT_i_bg";
const string I_SYM      = "BT_i_sym";
const string I_SPREAD   = "BT_i_spread";
const string I_CARD1    = "BT_i_card1";
const string I_WCARD   = "BT_i_wcard";
const string I_WCAP    = "BT_i_wcap";
const string I_WZERO   = "BT_i_wzero";
const string I_CAP1     = "BT_i_cap1";
const string I_P1       = "BT_i_p1";
const string I_P2       = "BT_i_p2";
const string I_P3       = "BT_i_p3";
const string I_CARD2    = "BT_i_card2";
const string I_CAP2     = "BT_i_cap2";
const string I_TB       = "BT_i_tb";
const string I_T1       = "BT_i_t1";
const string I_T2       = "BT_i_t2";
const string I_T3       = "BT_i_t3";
const string I_T4       = "BT_i_t4";
const string I_CARD3    = "BT_i_card3";
const string I_CAP3     = "BT_i_cap3";
const string I_A1       = "BT_i_a1";
const string I_A2       = "BT_i_a2";
const string I_CARD4    = "BT_i_card4";
const string I_CAP4     = "BT_i_cap4";
const string I_J1       = "BT_i_j1";
const string I_J2       = "BT_i_j2";
const string I_J3       = "BT_i_j3";
const string I_J4       = "BT_i_j4";
const string I_CARD5    = "BT_i_card5";
const string I_ST1      = "BT_i_st1";
const string I_ST2      = "BT_i_st2";
const string I_ST3      = "BT_i_st3";

// a position belongs to the panel when it is on this symbol and is ours (magic) or opened by hand (magic 0)
bool IsOurPosition()
{
   if(PositionGetString(POSITION_SYMBOL) != _Symbol) return false;
   if(InpAcceptAnyMagic) return true;
   long mg = PositionGetInteger(POSITION_MAGIC);
   return (mg == InpMagic) || (mg == 0);
}

// open positions on this symbol that the panel does not own (other magic number); the first one is reported
int ForeignPositions(long &firstMagic)
{
   int n = 0;
   firstMagic = 0;
   if(InpAcceptAnyMagic) return 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      long mg = PositionGetInteger(POSITION_MAGIC);
      if(mg == InpMagic || mg == 0) continue;
      if(n == 0) firstMagic = mg;
      n++;
   }
   return n;
}

//--- line objects
const string O_SL      = "BT_SL";        // shared SL line
const string PLAN_E    = "BT_PlanE";     // + index: entry lines (pending mode)
const string PLAN_T    = "BT_PlanT";     // + index: TP lines

//--- plan computed from the lines
struct PlanInfo
{
   bool            valid;
   string          err;
   bool            isBuy;
   int             cnt;
   double          sl;
   double          entry[MAXN];
   double          tp[MAXN];
   double          vol[MAXN];
   ENUM_ORDER_TYPE otype[MAXN];
   double          risk;
   double          reward;
   double          slPts;
   double          tpPts;
   double          slPct;
   double          tpPct;
   string          typeText;
};
PlanInfo g_plan;

//--- journal record (one row per closing deal)
struct TradeRec
{
   ulong    posId;
   string   type;
   double   volume;
   datetime openTime;
   double   openPrice;
   double   sl;          // initial SL (before any risk-free move)
   double   tp;
   double   lastSl;      // SL at the moment of closing
   datetime rfTime;      // when SL first reached break-even (0 = never)
   datetime closeTime;
   double   closePrice;
   string   reason;
   double   points;
   double   profit;
   double   commission;
   double   swap;
   double   net;
   double   rMult;
   double   mae;
   double   mfe;
   double   balance;
   double   rate;        // Toman per USD used for this row
   string   note;
};

//--- tracking of open positions (survives restarts through a state file)
struct OpenRec
{
   ulong    posId;
   bool     isBuy;
   double   sl;          // INITIAL SL, never overwritten
   double   tp;
   double   risk;
   double   maxp;
   double   minp;
   double   closedVol;
   double   lastSl;
   datetime rfTime;
   string   note;
};

CTrade    trade;
TradeRec  g_trades[];
OpenRec   g_open[];
string    g_btns[];

bool      g_riskMode   = false;
bool      g_pendMode   = false;
bool      g_lines      = true;
int       g_tpMode     = 0;      // 0 = R:R, 1 = profit % of balance
int       g_n          = 1;
int       g_maxN       = 10;
double    g_volLot     = 0.1;
double    g_volRisk    = 1.0;
double    g_tpR        = 2.0;
double    g_tpP        = 1.0;
int       g_slMode     = 0;      // 0 = points, 1 = % of price
double    g_slPts      = 500;
double    g_slPct      = 0.5;
int       g_px         = 16;
int       g_py         = 24;
int       g_ix         = 304;
int       g_iy         = 24;
string    g_pendNote   = "";
string    g_lastBtn    = "";
uint      g_lastBtnTick= 0;
bool      g_stateDirty = false;
uint      g_lastStateSave = 0;
int       g_fileErr    = 0;
string    g_periodKey = "";
int  g_drag = 0; int g_dragLX = 0; int g_dragLY = 0; bool g_btnDown = false; int g_infoH = 0;
#define WK_N 15
double g_wkPnl[WK_N];
bool   g_private = false;   // private mode: money values shown as ****
bool   g_ctlFold = false;   // control panel folded to its header
bool   g_dashShown = true; // bottom dashboard shown / hidden (only the arrow stays)
const string C_ARROW = "BT_ar_arrow";
string g_noteBuf = "";      // note text kept while folded
bool   g_grid    = false;   // grid strategy on
int    g_gridStep = 100;    // grid step (points)
string g_gridW   = "1,2,3"; // grid volume weights (1:2:3)
double g_basketTP = 0;      // basket target (USD)
void CreateControlPanel();
void MovePanelObjects(string prefix, int dx, int dy);
void CreatePanels();
bool   g_auto = false, g_autoTraded = false, g_autoArmed = false;
bool   g_autoEntryBusy = false;
uint   g_autoEntryTick = 0;
uint   g_lastUiRefreshTick = 0;
int    g_arsiP = 14, g_arsiHi = 70, g_arsiLo = 30;
int g_rsi1BuyMin=0, g_rsi1BuyMax=30, g_rsi1SellMin=70, g_rsi1SellMax=100;
ENUM_TIMEFRAMES g_r1Tf = PERIOD_CURRENT;
int g_r1TfSetting = PERIOD_CURRENT;
bool g_rsiSettingsOpen[3] = {false,false,false};
bool g_rsiShow[3] = {true,false,false};   // RSI dashboard: each gauge can be shown or hidden
bool g_rsiDash = false;                // RSI dashboard row (bottom strip)
datetime g_autoBar = 0;
bool   g_gridRsi = false;
int    g_autoStep = 10, g_autoSLSell = 100, g_autoSLBuy = 0, g_autoOpened = 0;
int g_gw = 250;
double g_r3Last = -1;
ENUM_TIMEFRAMES g_r3Tf = PERIOD_M15;
int g_r3P = 14;
int g_gh = 182;                    // gauge height, set by LayoutRsi from the chart size
bool g_infoOn = true;                  // info dashboard (BT_i_ objects) on/off
const string C_INFO = "BT_c_info";
bool g_slRsi = false;
bool g_dual = false, g_inDual = false;   // DUAL mode (one entry line, BUY and SELL on it)      // SL row RSI button: AUTO orders take their SL from the RSI stop
ENUM_TIMEFRAMES CycleRsiTf(ENUM_TIMEFRAMES cur,int delta);
void UpdateTrade();
void SetDashVisible(bool vis);
void CreateArrow();
int AutoPosCount(int &dir);
ulong g_tickSerial = 0;
bool AutoLocked();
int    g_keyMode = 0;      // keyboard: 0 off, 1 move SL, 2 move entries
datetime g_wkDay0 = 0;
uint     g_wkLast = 0;
bool   g_mgShown = false;   // management block visible in the info panel
bool   g_tradeOnlyInfo = false;
int  g_uiCtl = 100; int g_uiInfo = 100; int g_ctlW = 0; int g_ctlH = 0; int g_ctlHidden = 0; int g_infoW = 0;

//+------------------------------------------------------------------+
//| Theme                                                             |
//+------------------------------------------------------------------+
// palettes: the panel and the chart use the same set, so they always match
void ApplyTheme(int t)
{
   // two looks only: CYBER DARK (neon on deep violet-black) and CYBER LIGHT (neon on lilac-white)
   g_theme = (t == 1) ? 1 : 0;
   if(g_theme == 0)
   {
      g_bg = C'8,6,20';        g_card = C'16,12,36';   g_border = C'112,38,190';  g_input = C'10,8,26';
      g_text = C'232,236,255'; g_muted = C'142,132,196'; g_accent = C'0,229,255';
      g_btn = C'28,18,58';     g_btnOn = C'255,43,214'; g_onText = clrWhite;
      g_buy = C'0,229,255';    g_sell = C'255,43,214';  g_warn = C'190,120,255';
      g_dangerBg = C'70,8,62';  g_dangerFg = C'255,43,214';  g_amberBg = C'58,28,108'; g_amberFg = C'224,206,255';
      c_bg = C'8,6,20';        c_fg = C'200,190,255';  c_grid = C'34,24,70';
      c_up = C'0,229,255';     c_dn = C'255,43,214';
   }
   else
   {
      g_bg = C'238,234,252';   g_card = C'255,255,255'; g_border = C'184,150,236'; g_input = C'246,243,255';
      g_text = C'30,18,60';    g_muted = C'108,88,150'; g_accent = C'0,140,200';
      g_btn = C'232,224,250';  g_btnOn = C'200,30,180'; g_onText = clrWhite;
      g_buy = C'0,130,200';    g_sell = C'190,20,170';  g_warn = C'150,60,220';
      g_dangerBg = C'245,200,235'; g_dangerFg = C'150,10,130'; g_amberBg = C'230,215,250'; g_amberFg = C'90,40,140';
      c_bg = C'250,248,255';   c_fg = C'60,40,100';    c_grid = C'225,215,245';
      c_up = C'0,160,190';     c_dn = C'200,30,150';
   }
}

// short name shown on the theme button
string ThemeTag()
{
   string names[] = {"DK", "LT", "AU", "OC", "AQ"};
   return names[g_theme];
}
//+------------------------------------------------------------------+
//| Small helpers                                                     |
//+------------------------------------------------------------------+
string PlanEntryName(int i) { return PLAN_E + IntegerToString(i); }
string PlanTPName(int i)    { return PLAN_T + IntegerToString(i); }

double GetVol()  { return g_riskMode ? g_volRisk : g_volLot; }
void   SetVol(double v)
{
   if(v < 0) v = 0;
   if(g_riskMode) g_volRisk = v; else g_volLot = v;
}
double GetTP()   { return g_tpMode == 0 ? g_tpR : g_tpP; }
void   SetTPValue(double v)
{
   if(v < 0) v = 0;
   if(g_tpMode == 0) g_tpR = v; else g_tpP = v;
}

void SetText(string name, string txt)
{
   if(ObjectFind(0, name) < 0) return;
   if(txt == "") txt = " ";
   if(ObjectGetString(0, name, OBJPROP_TEXT) != txt)
      ObjectSetString(0, name, OBJPROP_TEXT, txt);
}

void SetColor(string name, color c)
{
   if(ObjectFind(0, name) < 0) return;
   if((color)ObjectGetInteger(0, name, OBJPROP_COLOR) != c)
      ObjectSetInteger(0, name, OBJPROP_COLOR, c);
}

void SetBG(string name, color c)
{
   if(ObjectFind(0, name) < 0) return;
   if((color)ObjectGetInteger(0, name, OBJPROP_BGCOLOR) != c)
   {
      ObjectSetInteger(0, name, OBJPROP_BGCOLOR, c);
      ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, c);
   }
}

// file-name safe version of a string (symbols can contain / # . etc.)
string SafeName(string s)
{
   string r = "";
   for(int i = 0; i < StringLen(s); i++)
   {
      ushort c = StringGetCharacter(s, i);
      bool ok = (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_' || c == '-';
      r += ok ? ShortToString(c) : "_";
   }
   return r;
}

string JoinFrom(string &p[], int from, string sep)
{
   string s = "";
   for(int i = from; i < ArraySize(p); i++)
   {
      if(i > from) s += sep;
      s += p[i];
   }
   return s;
}

int VolDigits()
{
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(step <= 0) step = 0.01;
   return (int)MathMax(0, MathRound(-MathLog10(step)));
}

// Split `total` lots into at most `n` orders, each >= min lot and a multiple of the step.
bool SplitVolume(double total, int n, double &vols[], int &eff, string &err)
{
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;

   long units    = (long)MathFloor(total / step + 1e-9);
   long minUnits = (long)MathMax(1.0, MathCeil(vmin / step - 1e-9));
   if(units < minUnits)
   {
      err = "Volume is below the minimum lot";
      return false;
   }
   long maxOrders = units / minUnits;
   eff = (int)MathMin((double)n, (double)maxOrders);
   if(eff < 1) eff = 1;

   long base = units / eff;
   long rem  = units - base * eff;
   ArrayResize(vols, eff);
   int d = VolDigits();
   for(int i = 0; i < eff; i++)
   {
      long u = base + ((long)i < rem ? 1 : 0);
      double v = (double)u * step;
      if(v > vmax) v = vmax;
      vols[i] = NormalizeDouble(v, d);
   }
   return true;
}

// status text is shown on two lines of the info panel
string g_stLines[12];        // status log, newest last (already wrapped to the panel width)
int    g_stN = 0;

void StatusPush(string line)
{
   if(g_stN < 12) { g_stLines[g_stN] = line; g_stN++; return; }
   for(int i = 1; i < 12; i++) g_stLines[i - 1] = g_stLines[i];
   g_stLines[11] = line;
}

// one message = time + text, wrapped at spaces so that nothing is cut
void SetStatus(string txt)
{
   const int W = 40;
   string line = TimeToString(TimeCurrent(), TIME_MINUTES) + "  " + txt;
   bool first = true;
   while(StringLen(line) > 0)
   {
      int cut = (int)MathMin(W, StringLen(line));
      if(StringLen(line) > W)
      {
         for(int i = W; i > 10; i--)
            if(StringGetCharacter(line, i) == ' ') { cut = i; break; }
      }
      string piece = StringSubstr(line, 0, cut);
      StringTrimRight(piece);
      StatusPush((first ? "" : "      ") + piece);
      first = false;
      line = StringSubstr(line, cut);
      StringTrimLeft(line);
   }
   // the card shows the three newest lines
   string rows[3] = {"", "", ""};
   for(int k = 0; k < 3; k++)
   {
      int idx = g_stN - 3 + k;
      if(idx >= 0) rows[k] = g_stLines[idx];
   }
   SetText(I_ST1, rows[0]);
   SetText(I_ST2, rows[1]);
   SetText(I_ST3, rows[2]);
   Print("[XauDesk] ", txt);
   ChartRedraw();
}

string GetNote()
{
   return ObjectGetString(0, C_NOTE, OBJPROP_TEXT);
}

string ReasonText(ENUM_DEAL_REASON r)
{
   switch(r)
   {
      case DEAL_REASON_SL:     return "SL";
      case DEAL_REASON_TP:     return "TP";
      case DEAL_REASON_SO:     return "StopOut";
      case DEAL_REASON_CLIENT:
      case DEAL_REASON_MOBILE:
      case DEAL_REASON_WEB:
      case DEAL_REASON_EXPERT: return "Manual";
   }
   return "Other";
}

//+------------------------------------------------------------------+
//| Persistence: settings + plan lines (global variables)             |
//+------------------------------------------------------------------+
string GVP() { return "XDN" + IntegerToString(InpMagic) + "_"; }

void GVset(string key, double v)
{
   if(InpRemember) GlobalVariableSet(GVP() + key, v);
}

bool GVget(string key, double &v)
{
   string n = GVP() + key;
   if(!GlobalVariableCheck(n)) return false;
   v = GlobalVariableGet(n);
   return true;
}

void SaveSettings()
{
   if(!InpRemember) return;
   GVset("risk",  g_riskMode ? 1 : 0);
   GVset("pend",  g_pendMode ? 1 : 0);
   GVset("lines", g_lines ? 1 : 0);
   GVset("tpm",   g_tpMode);
   GVset("n",     g_n);
   GVset("vlot",  g_volLot);
   GVset("vrisk", g_volRisk);
   GVset("tpr",   g_tpR);
   GVset("tpp",   g_tpP);
   GVset("theme", g_theme);
   GVset("fold", g_ctlFold ? 1 : 0);
   GVset("slm",   g_slMode);
   GVset("slp",   g_slPts);
   GVset("slpc",  g_slPct);
}

void LoadSettings()
{
   double v;
   if(GVget("risk", v))  g_riskMode = (v > 0.5);
   if(GVget("pend", v))  g_pendMode = (v > 0.5);
   if(GVget("lines", v)) g_lines = (v > 0.5);
   if(GVget("tpm", v))   g_tpMode = (v > 0.5) ? 1 : 0;
   if(GVget("n", v))     g_n = (int)v;
   if(GVget("vlot", v))  g_volLot = v;
   if(GVget("vrisk", v)) g_volRisk = v;
   if(GVget("tpr", v))   g_tpR = v;
   if(GVget("tpp", v))   g_tpP = v;
   if(GVget("theme", v)) g_theme = (int)MathMax(0, MathMin(4, v));
   if(GVget("fold", v))  g_ctlFold = (v > 0.5);
   if(GVget("slm", v))  g_slMode = (v > 0.5) ? 1 : 0;
   if(GVget("slp", v))  g_slPts = v;
   if(GVget("slpc", v)) g_slPct = v;
}

string PlanKeySL()          { return "sl_" + SafeName(_Symbol); }
string PlanKeyEntry(int i)  { return "ent" + IntegerToString(i) + "_" + SafeName(_Symbol); }

void SavePlanLines()
{
   if(!InpRemember) return;
   if(ObjectFind(0, O_SL) >= 0)
      GVset(PlanKeySL(), ObjectGetDouble(0, O_SL, OBJPROP_PRICE));
   for(int i = 1; i <= g_maxN; i++)
   {
      string en = PlanEntryName(i);
      if(ObjectFind(0, en) >= 0)
         GVset(PlanKeyEntry(i), ObjectGetDouble(0, en, OBJPROP_PRICE));
   }
}

void ClearSavedPlan()
{
   GlobalVariableDel(GVP() + PlanKeySL());
   for(int i = 1; i <= MAXN; i++)
      GlobalVariableDel(GVP() + PlanKeyEntry(i));
}

//+------------------------------------------------------------------+
//| Persistence: text files in Common\Files\XauDesk                |
//+------------------------------------------------------------------+
string JournalFile() { return "XauDesk\\Journal_" + SafeName(_Symbol) + "_" + IntegerToString(InpMagic) + "_" + g_periodKey + ".csv"; }
string StateFile()   { return "XauDesk\\State_"   + SafeName(_Symbol) + "_" + IntegerToString(InpMagic) + ".txt"; }

bool WriteTextFile(string path, string text)
{
   ResetLastError();
   int h = FileOpen(path, FILE_WRITE | FILE_BIN | FILE_COMMON);
   if(h == INVALID_HANDLE)
   {
      g_fileErr = GetLastError();
      return false;
   }
   uchar bom[3] = {0xEF, 0xBB, 0xBF};
   FileWriteArray(h, bom, 0, 3);
   uchar arr[];
   int n = StringToCharArray(text, arr, 0, WHOLE_ARRAY, CP_UTF8);
   if(n > 1) FileWriteArray(h, arr, 0, n - 1);
   FileClose(h);
   return true;
}

bool ReadTextFile(string path, string &text)
{
   if(!FileIsExist(path, FILE_COMMON)) return false;
   int h = FileOpen(path, FILE_READ | FILE_BIN | FILE_COMMON);
   if(h == INVALID_HANDLE) return false;
   int size = (int)FileSize(h);
   if(size <= 0) { FileClose(h); return false; }
   uchar arr[];
   ArrayResize(arr, size);
   FileReadArray(h, arr, 0, size);
   FileClose(h);
   int off = 0;
   if(size >= 3 && arr[0] == 0xEF && arr[1] == 0xBB && arr[2] == 0xBF) off = 3;
   text = CharArrayToString(arr, off, size - off, CP_UTF8);
   return true;
}

string CleanField(string s)
{
   StringReplace(s, "|", " ");
   StringReplace(s, "\r", " ");
   StringReplace(s, "\n", " ");
   return s;
}

void SaveOpenState()
{
   string s = "";
   for(int i = 0; i < ArraySize(g_open); i++)
   {
      OpenRec r = g_open[i];
      s += (string)r.posId + "|" + (r.isBuy ? "1" : "0") + "|" +
           DoubleToString(r.sl, 8) + "|" + DoubleToString(r.tp, 8) + "|" +
           DoubleToString(r.risk, 8) + "|" + DoubleToString(r.maxp, 8) + "|" +
           DoubleToString(r.minp, 8) + "|" + DoubleToString(r.closedVol, 8) + "|" +
           DoubleToString(r.lastSl, 8) + "|" + IntegerToString((long)r.rfTime) + "|" +
           CleanField(r.note) + "\n";
   }
   if(s == "") s = "\n";
   WriteTextFile(StateFile(), s);
   g_stateDirty = false;
   g_lastStateSave = GetTickCount();
}

void LoadOpenState()
{
   string txt;
   if(!ReadTextFile(StateFile(), txt)) return;
   string lines[];
   int n = StringSplit(txt, '\n', lines);
   for(int i = 0; i < n; i++)
   {
      string ln = lines[i];
      StringReplace(ln, "\r", "");
      if(ln == "") continue;
      string p[];
      int c = StringSplit(ln, '|', p);
      if(c < 10) continue;
      OpenRec r;
      r.posId     = (ulong)StringToInteger(p[0]);
      r.isBuy     = (p[1] == "1");
      r.sl        = StringToDouble(p[2]);
      r.tp        = StringToDouble(p[3]);
      r.risk      = StringToDouble(p[4]);
      r.maxp      = StringToDouble(p[5]);
      r.minp      = StringToDouble(p[6]);
      r.closedVol = StringToDouble(p[7]);
      r.lastSl    = StringToDouble(p[8]);
      r.rfTime    = (datetime)StringToInteger(p[9]);
      r.note      = (c > 10) ? JoinFrom(p, 10, "|") : "";
      int k = ArraySize(g_open);
      ArrayResize(g_open, k + 1);
      g_open[k] = r;
   }
}

//+------------------------------------------------------------------+
//| Widgets                                                           |
//+------------------------------------------------------------------+
void RegBtn(string n)
{
   for(int i = 0; i < ArraySize(g_btns); i++) if(g_btns[i] == n) return;
   int k = ArraySize(g_btns);
   ArrayResize(g_btns, k + 1);
   g_btns[k] = n;
}

bool IsInfoObj(string n) { return StringFind(n, "BT_i_") == 0; }
string FontFace(string f, string n)
{
   if(StringFind(f, "Symbol") >= 0) return f;
   return IsInfoObj(n) ? InpInfoFont : InpCtlFont;
}
int FontPt(int pt, string n)
{
   int sc = IsInfoObj(n) ? InpInfoFontScale * g_uiInfo / 100 : InpCtlFontScale * g_uiCtl / 100;
   sc = (int)MathMax(40, MathMin(200, sc));
   return (int)MathMax(6, MathRound(pt * sc / 100.0));
}

void MkRect(string n, int x, int y, int w, int h, color bg, color border)
{
   if(ObjectFind(0, n) < 0) ObjectCreate(0, n, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, n, OBJPROP_COLOR, border);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, border);   // neon edge
   ObjectSetInteger(0, n, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_BACK, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 0);
}

void MkLabel(string n, string txt, int x, int y, color clr, int size = 8,
             string font = "Segoe UI", ENUM_ANCHOR_POINT anchor = ANCHOR_LEFT_UPPER)
{
   if(ObjectFind(0, n) < 0) ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_ANCHOR, anchor);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, n, OBJPROP_TEXT, (txt == "") ? " " : txt);
   ObjectSetString(0, n, OBJPROP_FONT, FontFace(font, n));
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, FontPt(size, n));
   ObjectSetInteger(0, n, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 5);
}

void MkButton(string n, string txt, int x, int y, int w, int h, color bg, color fg,
              int fsize = 8, string font = "Segoe UI Semibold")
{
   if(ObjectFind(0, n) < 0) ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_TEXT, (txt == "") ? " " : txt);
   ObjectSetString(0, n, OBJPROP_FONT, FontFace(font, n));
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, FontPt(fsize, n));
   ObjectSetInteger(0, n, OBJPROP_COLOR, fg);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 10);
   RegBtn(n);
}

void MkEdit(string n, string txt, int x, int y, int w, int h)
{
   if(ObjectFind(0, n) < 0) ObjectCreate(0, n, OBJ_EDIT, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_TEXT, (txt == "") ? " " : txt);
   ObjectSetString(0, n, OBJPROP_FONT, FontFace("Segoe UI", n));
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, FontPt(9, n));
   ObjectSetInteger(0, n, OBJPROP_COLOR, g_text);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, g_input);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, g_border);
   ObjectSetInteger(0, n, OBJPROP_ALIGN, ALIGN_CENTER);
   ObjectSetInteger(0, n, OBJPROP_READONLY, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 10);
}

// active / inactive look for the two halves of a segmented control
void SetSeg(string name, bool active)
{
   SetBG(name, active ? g_btnOn : g_btn);
   SetColor(name, active ? g_onText : g_muted);
}

// SL distance from a reference price: points or % of price
double SLDist(double ref)
{
   if(g_slMode == 1 && !g_riskMode)
   {
      // distance at which the loss on the whole planned volume equals g_slPct % of balance
      double bal = AccountInfoDouble(ACCOUNT_BALANCE);
      double pr  = 0;
      if(bal > 0 && OrderCalcProfit(ORDER_TYPE_BUY, _Symbol, g_volLot, ref, ref + 1.0, pr) && MathAbs(pr) > 0)
         return (bal * g_slPct / 100.0) / MathAbs(pr);
   }
   return g_slPts * _Point;
}

string SLText() { return (g_slMode == 0) ? DoubleToString(g_slPts, 0) : DoubleToString(g_slPct, 2); }

// ---- money / Toman helpers ----
int g_mgmtVis = -1;   // -1 unknown, 0 hidden, 1 shown

string Thousands(double v)
{
   string s = DoubleToString(MathAbs(v), 0);
   string r = "";
   int c = 0;
   for(int i = StringLen(s) - 1; i >= 0; i--)
   {
      r = StringSubstr(s, i, 1) + r;
      c++;
      if(c % 3 == 0 && i > 0) r = "," + r;
   }
   return ((v < 0) ? "-" : "") + r;
}

string PctTxt(double p) { return g_private ? "**%" : StringFormat("%.2f%%", p); }

// amount in account currency, plus the Toman value when the dollar rate is set
string Money(double v)
{
   if(g_private) return "****";
   string s = DoubleToString(v, 2);
   if(InpUsdToman > 0)
      s += " (" + Thousands(v * InpUsdToman) + " T)";
   return s;
}


string VolText() { return DoubleToString(GetVol(), g_riskMode ? 2 : VolDigits()); }
string TPText()  { return DoubleToString(GetTP(), 2); }

string SunIcon()   { return ShortToString((ushort)0x2600); }
string MoonIcon()  { return ShortToString((ushort)0x263E); }
string PowerIcon() { return ShortToString((ushort)0x23FB); }

void RefreshUI()
{
   SetSeg(C_MKT,  !g_pendMode);
   SetSeg(C_PEND,  g_pendMode);
   SetSeg(C_LOT,  !g_riskMode);
   SetSeg(C_RISK,  g_riskMode);
   SetSeg(C_RRM,   g_tpMode == 0);
   SetSeg(C_PCT,   g_tpMode == 1);

   SetBG(C_LINES, g_lines ? g_buy : g_btn);
   SetColor(C_LINES, g_lines ? clrWhite : g_muted);
   SetText(C_THEME, ThemeTag());

   SetSeg(C_PRIV, g_private);
   SetSeg(C_GRID, g_grid);
   SetSeg(C_W1, g_gridW == "1,1,1");
   SetSeg(C_W2, g_gridW == "1,2,3");
   SetSeg(C_W3, g_gridW == "3,2,1");
   SetText(C_STEP, IntegerToString(g_gridStep));
   SetText(C_WGT, WeightsText());
   SetText(C_BTP, DoubleToString(g_basketTP, 0));
   SetText(C_FOLD, g_ctlFold ? "+" : "-");
   SetSeg(C_SLPTS, g_slMode == 0);
   SetSeg(C_SLPCT, g_slMode == 1);
   SetText(C_SLV, SLText());
   if(InpCtlHorizontal) SetText(C_CAPVOL, g_riskMode ? "RISK%" : "VOL");
   else                 SetText(C_CAPVOL, g_riskMode ? "RISK % (TOTAL)" : "LOT (TOTAL)");
   SetText(C_VOL, VolText());
   SetText(C_N,   IntegerToString(g_n));
   SetText(C_TP,  TPText());

   string u = (g_tpMode == 0) ? "R" : "%";
   SetText(C_Q1, "1" + u);
   SetText(C_Q2, "2" + u);
   SetText(C_Q3, "3" + u);
   double tv = GetTP();
   SetSeg(C_Q1, MathAbs(tv - 1.0) < 1e-9);
   SetSeg(C_Q2, MathAbs(tv - 2.0) < 1e-9);
   SetSeg(C_Q3, MathAbs(tv - 3.0) < 1e-9);
}

// ---- responsive sizing: every dashboard coordinate goes through UC() / UI() ----
int UC(int v) { return (int)MathRound(v * g_uiCtl / 100.0); }
int UI(int v) { return (int)MathRound(v * g_uiInfo / 100.0); }
int PX(int v) { return g_px + UC(v); }
int PY(int v) { return g_py + UC(v); }
int IX(int v) { return g_ix + UI(v); }
int IY(int v) { return g_iy + UI(v); }

// choose the size of each dashboard so it fits the chart height (or use InpUIScale)
void ComputeScale()
{
   int ctlWu = InpCtlHorizontal ? 1200 : PW;
   int ctlHu = InpCtlHorizontal ? (g_grid ? 144 : 96) : PH_C;
   if(InpUIScale > 0)
      g_uiCtl = g_uiInfo = (int)MathMax(40, MathMin(100, InpUIScale));
   else
   {
      int ch = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
      int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
      if(ch <= 0) ch = 800;
      if(cw <= 0) cw = 1200;
      int ctlTop  = InpPanelY;
      int infoTop = (InpInfoY >= 0) ? InpInfoY : (InpCtlHorizontal && !InpCtlAtBottom ? InpPanelY + ctlHu + 8 : InpPanelY);
      int hs = (ch - ctlTop - 8) * 100 / (ctlHu + 8);
      int ws = (cw - InpPanelX - 16) * 100 / ctlWu;
      g_uiCtl  = (int)MathMax(50, MathMin(100, MathMin(hs, ws)));
      g_uiInfo = (int)MathMax(50, MathMin(100, (ch - infoTop - 8) * 100 / (PH_I + 8)));
   }
   g_ctlW      = UC(ctlWu);
   g_ctlH      = UC(ctlHu);
   g_ctlHidden = UC(PH_C - 128);
   g_infoW     = UI(PW);
}

// ---- fold (collapse the control panel to its header) ----
// header objects stay visible when the control panel is folded
bool IsCtlHeader(string nm)
{
   return (nm == C_TITLE || nm == C_FOLD || nm == C_PRIV || nm == C_CSV || nm == C_LINES || nm == C_THEME || nm == C_AUTO || nm == C_ASTART);
}

// folded: delete the body of the control panel (only the header stays); unfolded: body is rebuilt
void ApplyFold()
{
   if(g_ctlFold)
   {
      int total = ObjectsTotal(0, -1, -1);
      for(int i = total - 1; i >= 0; i--)
      {
         string nm = ObjectName(0, i, -1, -1);
         if(StringFind(nm, "BT_c_") != 0 || nm == C_BG || IsCtlHeader(nm)) continue;
         ObjectDelete(0, nm);
      }
      ObjectSetInteger(0, C_BG, OBJPROP_YSIZE, UC(56));
   }
   ChartRedraw();
}

// rebuild the control panel after a state change (fold / grid): note kept, info panel follows the height
void RebuildControl()
{
   string note = (ObjectFind(0, C_NOTE) >= 0) ? GetNote() : g_noteBuf;
   g_noteBuf = note;
   int oldH = g_ctlH;

   string keepB[];
   int kn = 0;
   for(int i = 0; i < ArraySize(g_btns); i++)
      if(StringFind(g_btns[i], "BT_c_") != 0)
      {
         ArrayResize(keepB, kn + 1);
         keepB[kn++] = g_btns[i];
      }
   ArrayResize(g_btns, kn);
   for(int i = 0; i < kn; i++) g_btns[i] = keepB[i];

   ObjectsDeleteAll(0, "BT_c_");
   CreateControlPanel();
   ObjectSetString(0, C_NOTE, OBJPROP_TEXT, note);

   if(InpCtlHorizontal && !InpCtlAtBottom && g_ctlH != oldH)
   {
      int dy = g_ctlH - oldH;
      MovePanelObjects("BT_i_", 0, dy);
      g_iy += dy;
   }
   RefreshUI();
   UpdateExecuteButton();
}

// the bottom dashboard (every BT_c_ object) shown or hidden by its timeframe mask
void SetDashVisible(bool vis)
{
   int total = ObjectsTotal(0, -1, -1);
   for(int i = 0; i < total; i++)
   {
      string nm = ObjectName(0, i, -1, -1);
      if(StringFind(nm, "BT_c_") == 0)
         ObjectSetInteger(0, nm, OBJPROP_TIMEFRAMES, vis ? OBJ_ALL_PERIODS : OBJ_NO_PERIODS);
   }
   if(ObjectFind(0, C_ARROW) >= 0)
      ObjectSetString(0, C_ARROW, OBJPROP_TEXT, vis ? ShortToString(0x25BC) : ShortToString(0x25B2));
}

void CreateArrow()
{
   MkButton(C_ARROW, ShortToString(0x25BC), 0, 0, 10, 10, g_btn, g_text, 9, "Segoe UI Symbol");
   ObjectSetInteger(0, C_ARROW, OBJPROP_CORNER, CORNER_LEFT_LOWER);
   ObjectSetInteger(0, C_ARROW, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
   ObjectSetInteger(0, C_ARROW, OBJPROP_XDISTANCE, 8);
   ObjectSetInteger(0, C_ARROW, OBJPROP_YDISTANCE, 8);
   ObjectSetInteger(0, C_ARROW, OBJPROP_XSIZE, 40);
   ObjectSetInteger(0, C_ARROW, OBJPROP_YSIZE, 24);
   ObjectSetInteger(0, C_ARROW, OBJPROP_SELECTABLE, false);
}

void SetFold(bool f)
{
   g_ctlFold = f;
   RebuildControl();
}

// ---- horizontal strip: fills the chart width. Positions are in a 1100 px design grid,
// stretched to the real width by g_fx and re-placed when the chart is resized ----
double g_fx     = 1.0;
int    g_ctlHcw = 0;      // chart width the strip was last placed for
int    g_ctlHch = 0;      // chart height the strip was last placed for

int HX(int v) { return 8 + (int)MathRound(v * g_fx); }
int HW(int v) { return (int)MathRound(v * g_fx); }
int HY(int v) { return g_py + UC(v); }
int HH(int v) { return UC(v); }

void PB(string n, int x, int y, int w, int h)      // box object: position + size
{
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, HX(x));
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, HY(y));
   ObjectSetInteger(0, n, OBJPROP_XSIZE, HW(w));
   ObjectSetInteger(0, n, OBJPROP_YSIZE, HH(h));
}

void PL(string n, int x, int y)                    // label: position only
{
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, HX(x));
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, HY(y));
}

void PlaceCtlH()
{
   int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   if(cw <= 0) cw = 1200;
   g_ctlHcw = cw;
   int chh = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
   if(chh <= 0) chh = 800;
   g_ctlHch = chh;
   g_ctlH = UC(g_ctlFold ? 56 : (g_grid ? 144 : 96));
   g_py = InpCtlAtBottom ? MathMax(0, chh - g_ctlH - 4) : InpPanelY;
   g_px = 0;
   g_fx = MathMax(700.0, cw - 16.0) / 1700.0;   // wide layout: 1700 design units

   ObjectSetInteger(0, C_BG, OBJPROP_XDISTANCE, 0);
   ObjectSetInteger(0, C_BG, OBJPROP_YDISTANCE, g_py);
   ObjectSetInteger(0, C_BG, OBJPROP_XSIZE, cw);
   ObjectSetInteger(0, C_BG, OBJPROP_YSIZE, g_ctlH);

   // WIDE LAYOUT (design 1700): row 1 = TRADE bar, row 2 = LINES / DUAL / EXECUTE
   PB("BT_c_hcA", 8, 6, 1684, 42);
   PL(C_TITLE, 16, 19);
   PB(C_CSV, 80, 12, 44, 30);
   PB(C_FOLD, 128, 12, 30, 30);
   PB(C_THEME, 162, 12, 40, 30);
   PB(C_PRIV, 206, 12, 30, 30);
   PB(C_MKT, 252, 12, 84, 30);
   PB(C_PEND, 336, 12, 84, 30);
   PB(C_GRID, 420, 12, 84, 30);
   PB(C_LOT, 522, 12, 84, 30);
   PB(C_RISK, 606, 12, 84, 30);
   PL(C_CAPVOL, 712, 19);
   PB(C_VMINUS, 742, 12, 24, 30);
   PB(C_VOL, 770, 12, 66, 30);
   PB(C_VPLUS, 840, 12, 24, 30);
   PL(C_CAPN, 874, 19);
   PB(C_NMINUS, 898, 12, 24, 30);
   PB(C_N, 926, 12, 40, 30);
   PB(C_NPLUS, 970, 12, 24, 30);
   PL(C_CAPTP, 1006, 19);
   PB(C_TP, 1026, 12, 66, 30);
   PB(C_Q1, 1096, 12, 32, 30);
   PB(C_Q2, 1132, 12, 32, 30);
   PB(C_Q3, 1168, 12, 32, 30);
   PL(C_CAPSL, 1214, 19);
   PB(C_SLV, 1234, 12, 66, 30);
   PB(C_SLPTS, 1304, 12, 32, 30);
   PB(C_SLPCT, 1340, 12, 32, 30);
   PB(C_RRM, 1386, 12, 40, 30);
   PB(C_PCT, 1430, 12, 40, 30);
   PL(C_RRV, 1478, 19);
   PL(C_PFV, 1558, 19);

   PB("BT_c_hcB", 8, 50, 1684, 40);
   PB(C_LINES,   16, 54, 150, 32);
   PB(C_DUAL,   174, 54, 150, 32);
   PB(C_HEDGE, 332, 54, 130, 32);
   PB(C_EXEC, 1380, 54, 312, 32);

   // ROW 3 (y 96..136): grid settings, only while GRID is on
   if(g_grid)
   {
      PB("BT_c_hcE", 8, 96, 1184, 40);
      PL(C_CAPSTR, 16, 109);
      PB(C_STEP,   56, 100, 80, 28);
      PL(C_CAPWGT, 150, 109);
      PB(C_W1,    206, 100, 64, 28);
      PB(C_W2,    274, 100, 64, 28);
      PB(C_W3,    342, 100, 64, 28);
      PL(C_CAPBTP, 424, 109);
      PB(C_BTP,   480, 100, 110, 28);
      PL(C_HINT,  606, 109);
   }

}

// horizontal control strip: two rows (buttons on top, capital management below)
void CreateControlPanelH()
{
   MkRect(C_BG, 0, 0, 100, 100, g_bg, g_border);
   MkRect("BT_c_hcA", 0, 0, 10, 10, g_card, g_card);
   MkRect("BT_c_hcB", 0, 0, 10, 10, g_card, g_card);

   MkLabel(C_TITLE, "TRADE", 0, 0, g_text, 9, "Segoe UI Semibold");
   MkButton(C_FOLD,  "-",         0, 0, 10, 10, g_btn, g_text, 9);
   MkButton(C_PRIV,  "*",         0, 0, 10, 10, g_btn, g_text, 10);
   MkButton(C_CSV,   "CSV",       0, 0, 10, 10, g_btn, g_text, 6);
   MkButton(C_LINES, "LINES OFF", 0, 0, 10, 10, g_btn, g_muted, 8);
   MkButton(C_THEME, SunIcon(),   0, 0, 10, 10, g_btn, g_text, 10, "Segoe UI Symbol");
   MkButton(C_DUAL, "DUAL: OFF", 0, 0, 10, 10, g_btn, g_text, 8);
   MkButton(C_HEDGE, "HEDGE: OFF", 0, 0, 10, 10, g_btn, g_text, 8);

   MkButton(C_MKT,  "MARKET",   0, 0, 10, 10, g_btn, g_muted);
   MkButton(C_LOT,  "LOT",      0, 0, 10, 10, g_btn, g_muted);
   MkButton(C_RRM,  "R:R",      0, 0, 10, 10, g_btn, g_muted);
   MkButton(C_PEND, "PENDING",  0, 0, 10, 10, g_btn, g_muted);
   MkButton(C_RISK, "RISK %",   0, 0, 10, 10, g_btn, g_muted);
   MkButton(C_PCT,  "PROFIT %", 0, 0, 10, 10, g_btn, g_muted);
   MkButton(C_GRID, "GRID",     0, 0, 10, 10, g_btn, g_muted);
   MkButton(C_EXEC, "EXECUTE",  0, 0, 10, 10, g_btn, g_text, 9);

   MkLabel (C_CAPVOL, "", 0, 0, g_muted, 7);
   MkButton(C_VMINUS, "-", 0, 0, 10, 10, g_btn, g_text, 9);
   MkEdit  (C_VOL, "", 0, 0, 10, 10);
   MkButton(C_VPLUS,  "+", 0, 0, 10, 10, g_btn, g_text, 9);

   MkLabel (C_CAPN, "QTY", 0, 0, g_muted, 7);
   MkLabel(C_RRV, "1 : 2.0", 0, 0, g_text, 8, "Segoe UI Semibold");
   MkLabel(C_PFV, "+0.0%", 0, 0, g_buy, 8, "Segoe UI Semibold");
   MkButton(C_NMINUS, "-", 0, 0, 10, 10, g_btn, g_text, 9);
   MkEdit  (C_N, "", 0, 0, 10, 10);
   MkButton(C_NPLUS,  "+", 0, 0, 10, 10, g_btn, g_text, 9);

   MkLabel (C_CAPTP, "TP", 0, 0, g_muted, 7);
   MkEdit  (C_TP, "", 0, 0, 10, 10);
   MkButton(C_Q1, "", 0, 0, 10, 10, g_btn, g_muted, 8);
   MkButton(C_Q2, "", 0, 0, 10, 10, g_btn, g_muted, 8);
   MkButton(C_Q3, "", 0, 0, 10, 10, g_btn, g_muted, 8);

   MkLabel (C_CAPSL, "SL", 0, 0, g_muted, 7);
   MkEdit  (C_SLV, "", 0, 0, 10, 10);
   MkButton(C_SLPTS, "PTS", 0, 0, 10, 10, g_btn, g_muted, 8);
   MkButton(C_SLPCT, "%",   0, 0, 10, 10, g_btn, g_muted, 8);


   if(g_grid)
   {
      MkRect("BT_c_hcE", 0, 0, 10, 10, g_card, g_card);
      MkLabel (C_CAPSTR, "STEP", 0, 0, g_muted, 7);
      MkEdit  (C_STEP, "", 0, 0, 10, 10);
      MkLabel (C_CAPWGT, "WEIGHTS", 0, 0, g_muted, 7);
      MkButton(C_W1, "1:1:1", 0, 0, 10, 10, g_btn, g_muted, 8);
      MkButton(C_W2, "1:2:3", 0, 0, 10, 10, g_btn, g_muted, 8);
      MkButton(C_W3, "3:2:1", 0, 0, 10, 10, g_btn, g_muted, 8);
      MkLabel (C_CAPBTP, "BASKET $", 0, 0, g_muted, 7);
      MkEdit  (C_BTP, "", 0, 0, 10, 10);
      MkLabel (C_HINT, "Entries = your entry lines (PENDING); volume split by WEIGHTS; SL shared; BASKET closes all at the target", 0, 0, g_muted, 7);
   }



   PlaceCtlH();
}

void CreateControlPanel()
{
   if(InpCtlHorizontal) CreateControlPanelH();
   else                 CreateControlPanelV();
   ApplyFold();
}

void CreateControlPanelV()
{
   MkRect(C_BG, PX(0), PY(0), UC(PW), UC(PH_C), g_bg, g_border);

   // header
   MkLabel(C_TITLE, "TRADE", PX(16), PY(16), g_text, 10, "Segoe UI Semibold");
   MkButton(C_FOLD, "-", PX(72),  PY(8), UC(28), UC(32), g_btn, g_text, 10);
   MkButton(C_PRIV, "*", PX(104), PY(8), UC(28), UC(32), g_btn, g_text, 12);
   MkButton(C_CSV,   "CSV",       PX(140), PY(8), UC(28), UC(32), g_btn, g_text, 7);
   MkButton(C_LINES, PowerIcon(), PX(172), PY(8), UC(28), UC(32), g_btn, g_muted, 13, "Segoe UI Symbol");
   MkButton(C_THEME, SunIcon(),   PX(204), PY(8), UC(28), UC(32), g_btn, g_text, 13, "Segoe UI Symbol");

   // 1) two-way selectors in two columns
   MkRect(C_CARD1, PX(8), PY(48), UC(224), UC(128), g_card, g_card);
   MkButton(C_MKT,  "MARKET",   PX(16),  PY(56),  UC(100), UC(32), g_btn, g_muted);
   MkButton(C_PEND, "PENDING",  PX(122), PY(56),  UC(100), UC(32), g_btn, g_muted);
   MkButton(C_LOT,  "LOT",      PX(16),  PY(96),  UC(100), UC(32), g_btn, g_muted);
   MkButton(C_RISK, "RISK %",   PX(122), PY(96),  UC(100), UC(32), g_btn, g_muted);
   MkButton(C_RRM,  "R:R",      PX(16),  PY(136), UC(100), UC(32), g_btn, g_muted);
   MkButton(C_PCT,  "PROFIT %", PX(122), PY(136), UC(100), UC(32), g_btn, g_muted);

   // 2) volume, orders, take profit, stop loss, note
   MkRect(C_CARD2, PX(8), PY(184), UC(224), UC(208), g_card, g_card);
   MkLabel(C_CAPVOL, "", PX(16), PY(192), g_muted, 7);
   MkLabel(C_CAPN, "ORDERS", PX(136), PY(192), g_muted, 7);
   MkButton(C_VMINUS, "-", PX(16),  PY(208), UC(24), UC(32), g_btn, g_text, 10);
   MkEdit  (C_VOL, "",     PX(44),  PY(208), UC(56), UC(32));
   MkButton(C_VPLUS,  "+", PX(104), PY(208), UC(24), UC(32), g_btn, g_text, 10);
   MkButton(C_NMINUS, "-", PX(136), PY(208), UC(24), UC(32), g_btn, g_text, 10);
   MkEdit  (C_N, "",       PX(164), PY(208), UC(36), UC(32));
   MkButton(C_NPLUS,  "+", PX(204), PY(208), UC(24), UC(32), g_btn, g_text, 10);

   MkLabel (C_CAPTP, "", PX(16), PY(240), g_muted, 7);
   MkEdit  (C_TP, "",      PX(16),  PY(248), UC(64), UC(32));
   MkButton(C_Q1, "", PX(88),  PY(248), UC(40), UC(32), g_btn, g_muted);
   MkButton(C_Q2, "", PX(136), PY(248), UC(40), UC(32), g_btn, g_muted);
   MkButton(C_Q3, "", PX(184), PY(248), UC(40), UC(32), g_btn, g_muted);

   MkLabel (C_CAPSL, "STOP LOSS  (PTS / % OF BALANCE)", PX(16), PY(280), g_muted, 7);
   MkEdit  (C_SLV, "",      PX(16),  PY(296), UC(64), UC(32));
   MkButton(C_SLPTS, "PTS", PX(88),  PY(296), UC(64), UC(32), g_btn, g_muted);
   MkButton(C_SLPCT, "%",   PX(160), PY(296), UC(64), UC(32), g_btn, g_muted);

   MkLabel (C_CAPNOTE, "NOTE (saved in the journal)", PX(16), PY(336), g_muted, 7);
   MkEdit  (C_NOTE, "", PX(16), PY(352), UC(208), UC(32));

   // 3) primary action
   MkButton(C_EXEC, "EXECUTE", PX(8), PY(400), UC(224), UC(48), g_btn, g_text, 9);
   MkRect("BT_c_vcE", PX(8), PY(456), UC(224), UC(88), g_card, g_card);
   MkButton(C_GRID, "GRID", PX(16), PY(464), UC(100), UC(32), g_btn, g_muted);
   MkLabel (C_CAPBTP, "BASKET $", PX(126), PY(472), g_muted, 7);
   MkEdit  (C_BTP, "", PX(176), PY(464), UC(48), UC(32));
   MkLabel (C_CAPSTR, "STEP", PX(16), PY(520), g_muted, 7);
   MkEdit  (C_STEP, "", PX(50), PY(512), UC(64), UC(32));
   MkLabel (C_CAPWGT, "WEIGHTS", PX(122), PY(520), g_muted, 7);
   MkButton(C_WGT, "1:1:1", PX(176), PY(512), UC(48), UC(32), g_btn, g_text, 9);

}

// management block (CLOSE ALL / CANCEL / BE / reduce) inside the info panel:
// shown only while something is open; the cards below it move to make room
int g_mgY = 0;





//+------------------------------------------------------------------+
//| Moving panels (drag the title bar)                                |
//+------------------------------------------------------------------+

void MovePanelObjects(string prefix, int dx, int dy)
{
   int total = ObjectsTotal(0, -1, -1);
   for(int i = 0; i < total; i++)
   {
      string nm = ObjectName(0, i, -1, -1);
      if(StringFind(nm, prefix) != 0) continue;
      ObjectSetInteger(0, nm, OBJPROP_XDISTANCE, ObjectGetInteger(0, nm, OBJPROP_XDISTANCE) + dx);
      ObjectSetInteger(0, nm, OBJPROP_YDISTANCE, ObjectGetInteger(0, nm, OBJPROP_YDISTANCE) + dy);
   }
}

// move one dashboard to (nx, ny), keeping it fully inside the chart
void MoveBlock(bool info, int nx, int ny, int w, int h)
{
   int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   int ch = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
   nx = (int)MathMax(0, MathMin(nx, cw - w));
   ny = (int)MathMax(0, MathMin(ny, ch - h));
   int ox = info ? g_ix : g_px;
   int oy = info ? g_iy : g_py;
   int dx = nx - ox, dy = ny - oy;
   if(dx == 0 && dy == 0) return;
   MovePanelObjects(info ? "BT_i_" : "BT_c_", dx, dy);
   if(info) { g_ix = nx; g_iy = ny; }
   else     { g_px = nx; g_py = ny; }
   ChartRedraw();
}

void SaveLayout()
{
   GVset("cpx", g_px);
   GVset("cpy", g_py);
   GVset("ipx", g_ix);
   GVset("ipy", g_iy);
}

void LoadLayout()
{
   if(!InpRemember || InpResetLayout) return;
   double v;
   if(GVget("cpx", v)) g_px = (int)v;
   if(GVget("cpy", v)) g_py = (int)v;
   if(GVget("ipx", v)) g_ix = (int)v;
   if(GVget("ipy", v)) g_iy = (int)v;
}

// Start a drag when the button goes down on a title bar, follow the mouse while it is held.
void HandleMouse(int x, int y, bool down)
{
   if(down && !g_btnDown)
   {
      // control title: left part of the header (buttons on the right stay clickable)
      if(!InpCtlHorizontal && x >= g_px && x < g_px + 150 && y >= g_py && y < g_py + 40)
         g_drag = 1;
      else if(x >= g_ix && x < g_ix + g_infoW && y >= g_iy && y < g_iy + 40)
         g_drag = 2;
      if(g_drag != 0)
      {
         g_dragLX = x;
         g_dragLY = y;
         ChartSetInteger(0, CHART_MOUSE_SCROLL, false);
      }
   }
   else if(down && g_drag != 0)
   {
      if(g_drag == 1) MoveBlock(false, g_px + (x - g_dragLX), g_py + (y - g_dragLY), g_ctlW, g_ctlH);
      else            MoveBlock(true,  g_ix + (x - g_dragLX), g_iy + (y - g_dragLY), g_infoW, g_infoH);
      g_dragLX = x;
      g_dragLY = y;
   }
   else if(!down && g_drag != 0)
   {
      g_drag = 0;
      ChartSetInteger(0, CHART_MOUSE_SCROLL, true);
      SaveLayout();
   }
   g_btnDown = down;
}

void CreatePanels()
{
   ArrayResize(g_btns, 0);
   CreateControlPanel();
}

//+------------------------------------------------------------------+
//| Plan lines                                                        |
//+------------------------------------------------------------------+
void SetLine(string name, double price, color clr, bool selectable, string text,
             ENUM_LINE_STYLE style = STYLE_DASH)
{
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
      ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, name, OBJPROP_STYLE, InpLineStyle);
      ObjectSetInteger(0, name, OBJPROP_WIDTH, InpLineWidth);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, selectable);
      ObjectSetInteger(0, name, OBJPROP_SELECTED, selectable);
      ObjectSetInteger(0, name, OBJPROP_BACK, true);   // behind the dashboards
      ObjectSetDouble(0, name, OBJPROP_PRICE, price);
      ObjectSetString(0, name, OBJPROP_TEXT, text);
      return;
   }
   if(MathAbs(ObjectGetDouble(0, name, OBJPROP_PRICE) - price) > _Point * 0.5)
      ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   SetText(name, text);
}

void DeleteTPLines()
{
   ObjectsDeleteAll(0, PLAN_T);
}

void DeleteAllPlanLines(bool keepSaved)
{
   if(keepSaved) SavePlanLines();
   ObjectsDeleteAll(0, PLAN_E);
   ObjectsDeleteAll(0, PLAN_T);
   ObjectDelete(0, O_SL);
}

// Create / remove SL, entry and TP lines to match the current mode and order count.
// Positions saved in a previous session are restored when they are still near the price.
bool BuildPlanLines()
{
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(bid <= 0) return false;
   double sv;

   if(ObjectFind(0, O_SL) < 0)
   {
      double p = NormalizeDouble(bid - SLDist(bid), _Digits);
      if(InpRemember && GVget(PlanKeySL(), sv) && MathAbs(sv - bid) < bid * 0.2) p = sv;
      SetLine(O_SL, p, InpSLColor, true, "SL", STYLE_DASH);
   }

   double sl   = ObjectGetDouble(0, O_SL, OBJPROP_PRICE);
   double side = (sl < bid) ? -1.0 : 1.0; // entries start on the SL side of price (limit ladder)

   for(int i = 1; i <= g_maxN; i++)
   {
      string en = PlanEntryName(i);
      if(g_pendMode && i <= g_n)
      {
         if(ObjectFind(0, en) < 0)
         {
            double p = NormalizeDouble(bid + side * i * g_gridStep * _Point, _Digits);
            if(InpRemember && GVget(PlanKeyEntry(i), sv) && MathAbs(sv - bid) < bid * 0.2) p = sv;
            SetLine(en, p, InpEntryColor, true, "ENTRY " + IntegerToString(i), STYLE_DASHDOT);
         }
      }
      else
         ObjectDelete(0, en);
   }
   for(int i = g_maxN + 1; i <= MAXN; i++)
      ObjectDelete(0, PlanEntryName(i));

   ChartRedraw();
   return true;
}

// money at risk / at target for one planned order (absolute value)
double OrderMoney(int i, double target)
{
   ENUM_ORDER_TYPE mot = g_plan.isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double pr = 0;
   if(!OrderCalcProfit(mot, _Symbol, g_plan.vol[i], g_plan.entry[i], target, pr)) return 0;
   return MathAbs(pr);
}

// time of the bar in the middle of the visible chart (tags are centred there)
datetime TagTime()
{
   int first = (int)ChartGetInteger(0, CHART_FIRST_VISIBLE_BAR);
   int wb    = (int)ChartGetInteger(0, CHART_WIDTH_IN_BARS);
   int sh    = first - wb / 2;
   if(sh < 0) sh = 0;
   datetime t = iTime(_Symbol, _Period, sh);
   if(t == 0) t = TimeCurrent();
   return t;
}

// price tags: one entry per line, refreshed every pass
string g_tagNow[];
int    g_tagNowN = 0;

void BeginTags() { g_tagNowN = 0; }

// ---- price tags: fully rounded picture (pill) with white text, centred on the line ----
string g_resNames[];

bool ResKnown(string n)
{
   for(int i = 0; i < ArraySize(g_resNames); i++)
      if(g_resNames[i] == n) return true;
   return false;
}

// pill-shaped picture: filled with clr, transparent outside the rounded outline
void MakeTagPicture(string res, int w, int h, color clr)
{
   int r = h / 2;
   uint argb = ColorToARGB(clr, 255);
   uint px[];
   ArrayResize(px, w * h);
   for(int y = 0; y < h; y++)
      for(int x = 0; x < w; x++)
      {
         int cx = -1, cy = -1;
         if(x < r)          cx = r;
         else if(x >= w - r) cx = w - r - 1;
         if(y < r)          cy = r;
         else if(y >= h - r) cy = h - r - 1;
         bool inside = true;
         if(cx >= 0 && cy >= 0)
            inside = ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r);
         px[y * w + x] = inside ? argb : 0;
      }
   if(ResourceCreate(res, px, w, h, 0, 0, 0, COLOR_FORMAT_ARGB_NORMALIZE))
   {
      int k = ArraySize(g_resNames);
      ArrayResize(g_resNames, k + 1);
      g_resNames[k] = res;
   }
}

void ShowTag(string key, double price, string text, color clr)
{
   string bn = "BT_L_" + key;     // rounded picture
   string tn = "BT_LT_" + key;    // text

   double pmax = ChartGetDouble(0, CHART_PRICE_MAX);
   double pmin = ChartGetDouble(0, CHART_PRICE_MIN);
   int ch = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
   int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   if(pmax <= pmin || ch <= 0 || cw <= 0)
   {
      ObjectDelete(0, bn);
      ObjectDelete(0, tn);
      return;
   }

   // level outside the visible range: the tag stays on the top / bottom edge with an arrow
   string shown = text;
   int    yc;
   if(price > pmax)      { yc = 0;  shown = ShortToString(0x25B2) + " " + text; }
   else if(price < pmin) { yc = ch; shown = ShortToString(0x25BC) + " " + text; }
   else                  yc = (int)MathRound((pmax - price) / (pmax - pmin) * ch);

   int fs = (int)MathMax(6, MathMin(30, InpTagFontSize));
   string fnt = FontFace("Segoe UI", tn);
   TextSetFont(fnt, -fs * 10, 0, 0);       // measure with the same font
   uint tw = 0, th = 0;
   TextGetSize(shown, tw, th);
   int w = ((int)tw + 2 * InpTagPad + 7) / 8 * 8;   // width in 8 px steps (fewer picture variants)
   int h = fs + 12;
   string res = "::BTL_" + IntegerToString(w) + "_" + IntegerToString(h) + "_" + IntegerToString((long)clr);
   if(!ResKnown(res)) MakeTagPicture(res, w, h, clr);

   // left-aligned, starting 3 bars after the current candle (never over earlier candles)
   int x = cw - w - 12;
   datetime t3 = iTime(_Symbol, _Period, 0) + PeriodSeconds(_Period) * 3;
   int ax = 0, ay = 0;
   if(t3 > 0 && ChartTimePriceToXY(0, 0, t3, price, ax, ay)) x = ax;
   if(x > cw - w - 4) x = cw - w - 4;
   if(x < 0) x = 0;
   int y = yc - h / 2;
   if(y < 0) y = 0;
   if(y > ch - h) y = ch - h;

   int k = g_tagNowN;
   ArrayResize(g_tagNow, k + 2);
   g_tagNow[k]     = bn;
   g_tagNow[k + 1] = tn;
   g_tagNowN += 2;

   if(ObjectFind(0, bn) < 0)
   {
      ObjectCreate(0, bn, OBJ_BITMAP_LABEL, 0, 0, 0);
      ObjectSetInteger(0, bn, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, bn, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, bn, OBJPROP_ZORDER, 0);
   }
   if(ObjectGetString(0, bn, OBJPROP_BMPFILE, 0) != res)
      ObjectSetString(0, bn, OBJPROP_BMPFILE, 0, res);
   if(ObjectGetInteger(0, bn, OBJPROP_XDISTANCE) != x) ObjectSetInteger(0, bn, OBJPROP_XDISTANCE, x);
   if(ObjectGetInteger(0, bn, OBJPROP_YDISTANCE) != y) ObjectSetInteger(0, bn, OBJPROP_YDISTANCE, y);

   if(ObjectFind(0, tn) < 0)
   {
      ObjectCreate(0, tn, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, tn, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, tn, OBJPROP_ANCHOR, ANCHOR_CENTER);
      ObjectSetInteger(0, tn, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, tn, OBJPROP_ZORDER, 1);
   }
   int tx = x + w / 2 + InpTagDX, ty = y + h / 2 + InpTagDY;
   if(ObjectGetInteger(0, tn, OBJPROP_XDISTANCE) != tx) ObjectSetInteger(0, tn, OBJPROP_XDISTANCE, tx);
   if(ObjectGetInteger(0, tn, OBJPROP_YDISTANCE) != ty) ObjectSetInteger(0, tn, OBJPROP_YDISTANCE, ty);
   if(ObjectGetString(0, tn, OBJPROP_TEXT) != shown) ObjectSetString(0, tn, OBJPROP_TEXT, shown);
   if(ObjectGetString(0, tn, OBJPROP_FONT) != fnt)   ObjectSetString(0, tn, OBJPROP_FONT, fnt);
   ObjectSetInteger(0, tn, OBJPROP_FONTSIZE, fs);
   ObjectSetInteger(0, tn, OBJPROP_COLOR, clrWhite);
}

// remove tags that were not refreshed in this pass (line gone, plan invalid, lines off)
void EndTags()
{
   int total = ObjectsTotal(0, -1, -1);
   for(int i = total - 1; i >= 0; i--)
   {
      string nm = ObjectName(0, i, -1, -1);
      if(StringFind(nm, "BT_L") != 0) continue;
      bool keep = false;
      for(int j = 0; j < g_tagNowN; j++)
         if(g_tagNow[j] == nm) { keep = true; break; }
      if(!keep) ObjectDelete(0, nm);
   }
}

// readable name of a pending order type
string PendTypeText(ENUM_ORDER_TYPE t)
{
   switch(t)
   {
      case ORDER_TYPE_BUY_LIMIT:  return "BUY LIMIT";
      case ORDER_TYPE_BUY_STOP:   return "BUY STOP";
      case ORDER_TYPE_SELL_LIMIT: return "SELL LIMIT";
      case ORDER_TYPE_SELL_STOP:  return "SELL STOP";
   }
   return "ORDER";
}




//+------------------------------------------------------------------+
//| Plan calculation (entries, order types, volumes, TPs, risk)       |
//+------------------------------------------------------------------+
bool BuildPlan()
{
   g_plan.valid = false;
   g_plan.err = "";
   g_plan.cnt = 0;
   g_plan.risk = 0;
   g_plan.reward = 0;
   g_plan.slPts = 0;
   g_plan.tpPts = 0;
   g_plan.slPct = 0;
   g_plan.tpPct = 0;
   g_plan.typeText = "";

   if(!g_lines)                  { g_plan.err = "Lines are off"; return false; }
   if(ObjectFind(0, O_SL) < 0)   { g_plan.err = "SL line missing"; return false; }

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(bid <= 0 || ask <= 0)      { g_plan.err = "No price"; return false; }

   double sl = NormalizeDouble(ObjectGetDouble(0, O_SL, OBJPROP_PRICE), _Digits);
   int n = g_n;

   // direction comes from where SL sits relative to the (first) entry
   double ref = bid;
   if(g_pendMode)
   {
      string nm1 = PlanEntryName(1);
      if(ObjectFind(0, nm1) < 0) { g_plan.err = "Entry line missing"; return false; }
      ref = NormalizeDouble(ObjectGetDouble(0, nm1, OBJPROP_PRICE), _Digits);
   }
   if(MathAbs(sl - ref) < _Point * 0.5) { g_plan.err = "SL is at the entry price"; return false; }

   bool isBuy = (sl < ref);
   g_plan.isBuy = isBuy;
   g_plan.sl = sl;
   ENUM_ORDER_TYPE mot = isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;

   long lvl = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minDist = lvl * _Point;
   bool hasLimit = false, hasStop = false;

   for(int i = 0; i < n; i++)
   {
      double e;
      if(g_pendMode)
      {
         string nm = PlanEntryName(i + 1);
         if(ObjectFind(0, nm) < 0) { g_plan.err = "Entry line missing"; return false; }
         e = NormalizeDouble(ObjectGetDouble(0, nm, OBJPROP_PRICE), _Digits);
      }
      else
         e = isBuy ? ask : bid;

      if(isBuy && sl >= e)  { g_plan.err = "All entries must be above SL (BUY)";  return false; }
      if(!isBuy && sl <= e) { g_plan.err = "All entries must be below SL (SELL)"; return false; }
      if(lvl > 0 && MathAbs(e - sl) < minDist) { g_plan.err = "SL too close to entry"; return false; }

      g_plan.entry[i] = e;
      if(!g_pendMode && !g_grid)
         g_plan.otype[i] = mot;
      else if(isBuy)
      {
         if(e > ask)      { g_plan.otype[i] = ORDER_TYPE_BUY_STOP;  hasStop = true; }
         else if(e < ask) { g_plan.otype[i] = ORDER_TYPE_BUY_LIMIT; hasLimit = true; }
         else             { g_plan.err = "Entry equals current price"; return false; }
      }
      else
      {
         if(e < bid)      { g_plan.otype[i] = ORDER_TYPE_SELL_STOP;  hasStop = true; }
         else if(e > bid) { g_plan.otype[i] = ORDER_TYPE_SELL_LIMIT; hasLimit = true; }
         else             { g_plan.err = "Entry equals current price"; return false; }
      }
   }

   // total volume
   double total;
   if(!g_riskMode)
      total = g_volLot;
   else
   {
      double sumLoss = 0;
      for(int i = 0; i < n; i++)
      {
         double pr = 0;
         if(!OrderCalcProfit(mot, _Symbol, 1.0, g_plan.entry[i], sl, pr)) { g_plan.err = "Risk calc failed"; return false; }
         sumLoss += MathAbs(pr);
      }
      double avgLoss = sumLoss / n;
      if(avgLoss <= 0) { g_plan.err = "Risk calc failed"; return false; }
      total = AccountInfoDouble(ACCOUNT_BALANCE) * g_volRisk / 100.0 / avgLoss;
   }

   double v[];
   int eff = n;
   string serr = "";
   if(n > 1)   // any split into several orders follows the chosen ratio
   {
      if(!GridVolumes(total, n, v, serr)) { g_plan.err = serr; return false; }
      eff = n;
   }
   else if(!SplitVolume(total, n, v, eff, serr)) { g_plan.err = serr; return false; }
   g_plan.cnt = eff;
   for(int i = 0; i < eff; i++) g_plan.vol[i] = v[i];

   // take profit
   double tv = GetTP();
   double pctDistPts = 0;
   if(tv > 0 && g_tpMode == 1)
   {
      double sumVal = 0;
      for(int i = 0; i < eff; i++)
      {
         double e  = g_plan.entry[i];
         double e2 = isBuy ? e + 100 * _Point : e - 100 * _Point;
         double pr = 0;
         if(!OrderCalcProfit(mot, _Symbol, 1.0, e, e2, pr)) { g_plan.err = "TP calc failed"; return false; }
         sumVal += g_plan.vol[i] * (pr / 100.0); // money per point for this order
      }
      if(sumVal <= 0) { g_plan.err = "TP calc failed"; return false; }
      double target = AccountInfoDouble(ACCOUNT_BALANCE) * tv / 100.0;
      pctDistPts = target / sumVal;
   }

   for(int i = 0; i < eff; i++)
   {
      double e = g_plan.entry[i];
      double t = 0;
      if(tv > 0)
      {
         double dist = (g_tpMode == 0) ? tv * MathAbs(e - sl) : pctDistPts * _Point;
         t = isBuy ? e + dist : e - dist;
      }
      g_plan.tp[i] = NormalizeDouble(t, _Digits);
   }

   // risk / reward in money
   for(int i = 0; i < eff; i++)
   {
      double pr = 0;
      if(OrderCalcProfit(mot, _Symbol, g_plan.vol[i], g_plan.entry[i], sl, pr))
         g_plan.risk += MathAbs(pr);
      if(g_plan.tp[i] > 0 && OrderCalcProfit(mot, _Symbol, g_plan.vol[i], g_plan.entry[i], g_plan.tp[i], pr))
         g_plan.reward += pr;
   }

   double e0 = g_plan.entry[0];
   g_plan.slPts = MathAbs(e0 - sl) / _Point;
   g_plan.slPct = (e0 > 0) ? MathAbs(e0 - sl) / e0 * 100.0 : 0;
   if(g_plan.tp[0] > 0)
   {
      g_plan.tpPts = MathAbs(g_plan.tp[0] - e0) / _Point;
      g_plan.tpPct = (e0 > 0) ? MathAbs(g_plan.tp[0] - e0) / e0 * 100.0 : 0;
   }

   string base = isBuy ? "BUY" : "SELL";
   if(!g_pendMode && !g_grid)   g_plan.typeText = base + " MARKET";
   else if(hasLimit && hasStop) g_plan.typeText = base + " LIMIT+STOP";
   else if(hasLimit)            g_plan.typeText = base + " LIMIT";
   else                         g_plan.typeText = base + " STOP";

   g_plan.valid = true;
   return true;
}

//+------------------------------------------------------------------+
//| Position helpers                                                  |
//+------------------------------------------------------------------+
void CountGroup(int &np, int &nq)
{
   np = 0; nq = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(IsOurPosition())
         np++;
   }
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) == _Symbol && OrderGetInteger(ORDER_MAGIC) == InpMagic)
         nq++;
   }
}

bool PositionExistsById(ulong id)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if((ulong)PositionGetInteger(POSITION_IDENTIFIER) == id) return true;
   }
   return false;
}

int FindOpen(ulong id)
{
   for(int i = 0; i < ArraySize(g_open); i++)
      if(g_open[i].posId == id) return i;
   return -1;
}

void RemoveOpen(int idx)
{
   int n = ArraySize(g_open);
   if(idx < 0 || idx >= n) return;
   for(int j = idx; j < n - 1; j++)
      g_open[j] = g_open[j + 1];
   ArrayResize(g_open, n - 1);
   g_stateDirty = true;
}

// SL is at (or beyond) break-even
bool IsRiskFree(bool isBuy, double sl, double open)
{
   if(sl <= 0) return false;
   double eps = _Point * 0.5;
   return isBuy ? (sl >= open - eps) : (sl <= open + eps);
}

// -1 no positions, 0 none risk-free, 1 all risk-free, 2 mixed
int BEState()
{
   int np = 0, atBE = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(!IsOurPosition()) continue;
      np++;
      bool isBuy = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
      if(IsRiskFree(isBuy, PositionGetDouble(POSITION_SL), PositionGetDouble(POSITION_PRICE_OPEN))) atBE++;
   }
   if(np == 0) return -1;
   if(atBE == 0) return 0;
   if(atBE == np) return 1;
   return 2;
}

// Record the INITIAL SL/TP of every position the first time we see it
// (before any break-even move) and keep MAE / MFE / last SL up to date.
void TrackPositions()
{
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(!IsOurPosition()) continue;

      ulong id = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
      bool isBuy = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
      double op  = PositionGetDouble(POSITION_PRICE_OPEN);
      double cs  = PositionGetDouble(POSITION_SL);
      int k = FindOpen(id);
      if(k < 0)
      {
         double vol = PositionGetDouble(POSITION_VOLUME);
         OpenRec r;
         r.posId = id;
         r.isBuy = isBuy;
         r.sl    = cs;                       // initial SL
         r.tp    = PositionGetDouble(POSITION_TP);
         r.maxp  = op;
         r.minp  = op;
         r.note  = g_pendNote;
         r.risk  = 0;
         r.closedVol = 0;
         r.lastSl = cs;
         r.rfTime = 0;
         double pr = 0;
         if(r.sl > 0 && OrderCalcProfit(isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, _Symbol, vol, op, r.sl, pr))
            r.risk = MathAbs(pr);
         k = ArraySize(g_open);
         ArrayResize(g_open, k + 1);
         g_open[k] = r;
         g_stateDirty = true;
      }

      double p = isBuy ? bid : ask;
      if(p > 0)
      {
         if(p > g_open[k].maxp) { g_open[k].maxp = p; g_stateDirty = true; }
         if(p < g_open[k].minp) { g_open[k].minp = p; g_stateDirty = true; }
      }
      if(MathAbs(cs - g_open[k].lastSl) > _Point * 0.5)
      {
         g_open[k].lastSl = cs;
         g_stateDirty = true;
      }
      // first time the SL reaches break-even (and it was not there from the start)
      if(g_open[k].rfTime == 0 && IsRiskFree(isBuy, cs, op) && !IsRiskFree(isBuy, g_open[k].sl, op))
      {
         g_open[k].rfTime = TimeCurrent();
         g_stateDirty = true;
      }
   }
}

//+------------------------------------------------------------------+
//| Trading actions                                                   |
//+------------------------------------------------------------------+
void Execute();
// DUAL: one entry line with a BUY and a SELL on the same price. Each side is a normal PENDING order:
// above the market it is BUY STOP + SELL LIMIT, below it is SELL STOP + BUY LIMIT (chosen by Execute).
void DualExecute()
{
   if(g_grid) { SetStatus("DUAL: turn GRID off first"); return; }
   if(!g_lines || ObjectFind(0, O_SL) < 0) { SetStatus("DUAL: turn LINES on and place the SL line"); return; }
   double S = ObjectGetDouble(0, O_SL, OBJPROP_PRICE, 0);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double minD = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   double ref;
   if(g_pendMode)
   {
      if(ObjectFind(0, PlanEntryName(1)) < 0) { SetStatus("DUAL: place the entry line (PENDING)"); return; }
      ref = ObjectGetDouble(0, PlanEntryName(1), OBJPROP_PRICE, 0);
      // a pending pair needs the entry above the ask (BUY STOP + SELL LIMIT) or below the bid (SELL STOP + BUY LIMIT)
      if(ref > bid && ref < ask) { SetStatus("DUAL pending: the entry is between bid and ask - move it above the ask or below the bid"); return; }
      if(MathAbs(ref - ask) < minD || MathAbs(ref - bid) < minD)
      { SetStatus(StringFormat("DUAL pending: the entry is closer than the broker stops level (%.0f pts)", minD / _Point)); return; }
   }
   else ref = (bid + ask) / 2.0;
   double pn = NormalizeDouble(ref, _Digits);
   double d  = MathAbs(pn - S);
   if(d <= 0) { SetStatus("DUAL: the SL distance is zero"); return; }

   g_inDual = true;
   // BUY side: SL below the reference price
   SetLine(O_SL, NormalizeDouble(pn - d, _Digits), InpSLColor, true, "SL", STYLE_DASH);
   g_lines = true; BuildPlanLines();
   if(g_pendMode) for(int i = 1; i <= g_n; i++) if(ObjectFind(0, PlanEntryName(i)) >= 0) ObjectSetDouble(0, PlanEntryName(i), OBJPROP_PRICE, pn);
   Execute();
   bool okBuy = g_execOk; string mBuy = g_execMsg;
   // SELL side: SL above the reference price
   SetLine(O_SL, NormalizeDouble(pn + d, _Digits), InpSLColor, true, "SL", STYLE_DASH);
   g_lines = true; BuildPlanLines();
   if(g_pendMode) for(int i = 1; i <= g_n; i++) if(ObjectFind(0, PlanEntryName(i)) >= 0) ObjectSetDouble(0, PlanEntryName(i), OBJPROP_PRICE, pn);
   Execute();
   bool okSell = g_execOk; string mSell = g_execMsg;
   g_inDual = false;
   string kind = g_pendMode ? "pending" : "market";
   SetStatus(StringFormat("DUAL %s @ %s | BUY %s | SELL %s", kind, DoubleToString(pn, _Digits),
                          okBuy ? "sent" : "FAILED", okSell ? "sent" : "FAILED"));
   if(!okBuy || !okSell) Print("DUAL details: BUY -> ", mBuy, " | SELL -> ", mSell);
}

bool   g_execOk = false;
string g_execMsg = "";

void Execute()
{
   if(g_dual && !g_inDual) { DualExecute(); return; }
   g_execOk = false; g_execMsg = "";
   if(!g_lines)
   {
      SetStatus("Turn LINES ON (power icon) to plan a trade first.");
      return;
   }
   if(!BuildPlan())
   {
      SetStatus(g_plan.err);
      return;
   }

   bool   isBuy = g_plan.isBuy;
   double sl    = g_plan.sl;
   int    cnt   = g_plan.cnt;
   double e[MAXN], t[MAXN], v[MAXN];
   ENUM_ORDER_TYPE ot[MAXN];
   for(int i = 0; i < cnt; i++)
   {
      e[i] = g_plan.entry[i];
      t[i] = g_plan.tp[i];
      v[i] = g_plan.vol[i];
      ot[i] = g_plan.otype[i];
   }

   // spread guard (market orders only): refuse to fire into a wide spread
   if(!g_pendMode && InpMaxSpreadPts > 0)
   {
      int sp = (int)MathRound((SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID)) / _Point);
      if(sp > InpMaxSpreadPts)
      {
         SetStatus(StringFormat("Blocked: spread %d > max %d pts", sp, InpMaxSpreadPts));
         return;
      }
   }

   g_pendNote = GetNote();
   int okCount = 0;
   string lastErr = "";
   double slipSum = 0;
   int slipN = 0;

   for(int i = 0; i < cnt; i++)
   {
      bool ok;
      double expected = isBuy ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
      if(!g_pendMode && !g_grid)
      {
         ok = isBuy ? trade.Buy(v[i], _Symbol, 0, sl, t[i], "XauDesk")
                    : trade.Sell(v[i], _Symbol, 0, sl, t[i], "XauDesk");
      }
      else
         ok = trade.OrderOpen(_Symbol, ot[i], v[i], 0.0, e[i], sl, t[i], ORDER_TIME_GTC, 0, "XauDesk");

      uint rc = trade.ResultRetcode();
      bool sent = ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED || rc == TRADE_RETCODE_DONE_PARTIAL);

      // informational only: how far the market fill was from the price at send time
      if(sent && !g_pendMode && !g_grid)
      {
         double fill = trade.ResultPrice();
         if(fill > 0)
         {
            slipSum += isBuy ? fill - expected : expected - fill;
            slipN++;
         }
      }

      if(sent) okCount++;
      else     lastErr = trade.ResultRetcodeDescription();
   }

   TrackPositions(); // capture the initial SL right away

   string msg = StringFormat("%s: %d/%d orders sent", isBuy ? "BUY" : "SELL", okCount, cnt);
   if(cnt < g_n) msg += StringFormat(" (min lot allows only %d)", cnt);
   if(slipN > 0) msg += StringFormat(" | slip %.0f pts", slipSum / slipN / _Point);
   if(lastErr != "") msg += " | " + lastErr;

   if(okCount > 0)
   {
      g_lines = false;            // hide guide lines after execution
      ClearSavedPlan();
      DeleteAllPlanLines(false);
      SaveSettings();
      RefreshUI();
   }
   g_execOk = (okCount > 0); g_execMsg = msg;
   SetStatus(msg);
}

void CloseAllPositions()
{
   ulong tks[];
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(!IsOurPosition()) continue;
      int k = ArraySize(tks);
      ArrayResize(tks, k + 1);
      tks[k] = tk;
   }
   if(ArraySize(tks) == 0) { SetStatus("No open positions."); return; }
   int fail = 0;
   for(int i = 0; i < ArraySize(tks); i++)
      if(!trade.PositionClose(tks[i])) fail++;
   SetStatus(fail == 0 ? "All positions closed." : StringFormat("%d close(s) failed: %s", fail, trade.ResultRetcodeDescription()));
}

void CancelPendings()
{
   ulong tks[];
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol || OrderGetInteger(ORDER_MAGIC) != InpMagic) continue;
      int k = ArraySize(tks);
      ArrayResize(tks, k + 1);
      tks[k] = tk;
   }
   if(ArraySize(tks) == 0) { SetStatus("No pending orders."); return; }
   int fail = 0;
   for(int i = 0; i < ArraySize(tks); i++)
      if(!trade.OrderDelete(tks[i])) fail++;
   SetStatus(fail == 0 ? "Pending orders cancelled." : StringFormat("%d cancel(s) failed: %s", fail, trade.ResultRetcodeDescription()));
}

// BE ON: SL of every open position -> its own entry price (initial SL stays recorded)
void BreakevenOn()
{
   ulong tks[];
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(!IsOurPosition()) continue;
      int k = ArraySize(tks);
      ArrayResize(tks, k + 1);
      tks[k] = tk;
   }
   if(ArraySize(tks) == 0) { SetStatus("No open positions."); return; }
   TrackPositions(); // make sure every initial SL is stored before we touch it
   double spr = SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID);   // current spread
   int done = 0, fail = 0;
   for(int i = 0; i < ArraySize(tks); i++)
   {
      if(!PositionSelectByTicket(tks[i])) continue;
      bool isBuy = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
      double op = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      if(IsRiskFree(isBuy, sl, op)) continue;   // already risk-free
      double beSL = NormalizeDouble(isBuy ? op + spr : op - spr, _Digits);   // a stop at the entry alone loses the spread
      if(trade.PositionModify(tks[i], beSL, tp)) done++; else fail++;
   }
   UpdateBEButtons();
   SetStatus(fail == 0 ? StringFormat("Break-even ON (%d positions), stop at entry +/- spread (%.2f).", done, spr)
                       : StringFormat("BE failed on %d: %s", fail, trade.ResultRetcodeDescription()));
}

// BE OFF: put every risk-free position back to its INITIAL SL
void BreakevenOff()
{
   ulong tks[];
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(!IsOurPosition()) continue;
      int k = ArraySize(tks);
      ArrayResize(tks, k + 1);
      tks[k] = tk;
   }
   if(ArraySize(tks) == 0) { SetStatus("No open positions."); return; }
   int done = 0, fail = 0, unknown = 0;
   for(int i = 0; i < ArraySize(tks); i++)
   {
      if(!PositionSelectByTicket(tks[i])) continue;
      ulong id = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
      bool isBuy = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
      double op = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      if(!IsRiskFree(isBuy, sl, op)) continue;   // not at break-even, nothing to restore
      int k = FindOpen(id);
      double restore = (k >= 0 && g_open[k].sl > 0) ? g_open[k].sl : (isBuy ? op - SLDist(op) : op + SLDist(op));
      if(trade.PositionModify(tks[i], NormalizeDouble(restore, _Digits), tp)) done++; else fail++;
   }
   string msg = StringFormat("Break-even OFF: %d restored to initial SL", done);
   if(fail > 0)    msg += StringFormat(" | %d failed: %s", fail, trade.ResultRetcodeDescription());
   if(unknown > 0) msg += StringFormat(" | %d have no stored SL", unknown);
   SetStatus(msg);
}

//+------------------------------------------------------------------+
//| Reduce open volume by a percentage (partial close)                |
//+------------------------------------------------------------------+
struct PosItem
{
   ulong  tk;
   long   units;    // volume in lot steps
   double profit;
   long   closeU;   // units to close
};

bool ClosePartialUnits(ulong tk, long units, long posUnits, double step)
{
   if(units >= posUnits) return trade.PositionClose(tk);
   double vol = NormalizeDouble(units * step, VolDigits());
   bool hedging = (AccountInfoInteger(ACCOUNT_MARGIN_MODE) == ACCOUNT_MARGIN_MODE_RETAIL_HEDGING);
   if(hedging) return trade.PositionClosePartial(tk, vol);
   return trade.PositionClosePartial(_Symbol, vol);
}

void ReducePositions(double pct)
{
   if(pct <= 0 || pct >= 100) { SetStatus("Reduce % must be between 0 and 100."); return; }

   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   if(step <= 0) step = 0.01;
   long minU = (long)MathMax(1.0, MathCeil(vmin / step - 1e-9));

   PosItem it[];
   int n = 0;
   long totalU = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(!IsOurPosition()) continue;
      ArrayResize(it, n + 1);
      it[n].tk     = tk;
      it[n].units  = (long)MathRound(PositionGetDouble(POSITION_VOLUME) / step);
      it[n].profit = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      it[n].closeU = 0;
      totalU += it[n].units;
      n++;
   }
   if(n == 0) { SetStatus("No open positions."); return; }

   // total to close: pct of the open volume, rounded down to the lot step,
   // and never the whole thing (at least one min lot stays open)
   long target   = (long)MathFloor(totalU * pct / 100.0 + 1e-9);
   long maxClose = totalU - minU;
   if(target > maxClose) target = maxClose;
   if(target < minU) { SetStatus("Reduction is below the minimum lot."); return; }

   // order: most profitable first (bank profit) or most losing first (cut risk)
   for(int a = 0; a < n - 1; a++)
      for(int b = a + 1; b < n; b++)
      {
         bool doSwap = (InpScaleOutOrder == SCALE_PROFIT_FIRST) ? (it[b].profit > it[a].profit)
                                                                : (it[b].profit < it[a].profit);
         if(doSwap) { PosItem tmp = it[a]; it[a] = it[b]; it[b] = tmp; }
      }

   // pass 1: the same % from every position (keeps the ladder proportional)
   long used = 0;
   for(int i = 0; i < n; i++)
   {
      long c = (long)MathFloor(it[i].units * pct / 100.0 + 1e-9);
      if(it[i].units - c < minU) c = it[i].units - minU;
      if(c < minU) c = 0;
      it[i].closeU = c;
      used += c;
   }
   long rem = target - used;

   // pass 2: spend the remainder on closing whole positions (small lots cannot be split)
   for(int i = 0; i < n && rem > 0; i++)
   {
      long left = it[i].units - it[i].closeU;
      if(left > 0 && left <= rem)
      {
         it[i].closeU = it[i].units;
         rem -= left;
      }
   }
   // pass 3: anything still left -> extra partial from positions that have room
   for(int i = 0; i < n && rem >= minU; i++)
   {
      long room = it[i].units - it[i].closeU - minU;
      if(room < minU) continue;
      long extra = (long)MathMin((double)room, (double)rem);
      it[i].closeU += extra;
      rem -= extra;
   }

   double closedVol = 0;
   int fail = 0;
   for(int i = 0; i < n; i++)
   {
      if(it[i].closeU <= 0) continue;
      if(ClosePartialUnits(it[i].tk, it[i].closeU, it[i].units, step))
         closedVol += it[i].closeU * step;
      else
         fail++;
   }
   double totalVol = totalU * step;
   string msg = StringFormat("Reduced %.2f of %.2f lot (%.0f%%)", closedVol, totalVol,
                             totalVol > 0 ? closedVol / totalVol * 100.0 : 0);
   if(fail > 0) msg += StringFormat(" | %d failed: %s", fail, trade.ResultRetcodeDescription());
   SetStatus(msg);
}

//+------------------------------------------------------------------+
//| Journal                                                           |
//+------------------------------------------------------------------+
void CalcStats(int &n, int &wins, double &net, double &pf, double &avgR)
{
   n = ArraySize(g_trades);
   wins = 0; net = 0; pf = 0; avgR = 0;
   double gp = 0, gl = 0, rsum = 0;
   for(int i = 0; i < n; i++)
   {
      double v = g_trades[i].net;
      net += v;
      rsum += g_trades[i].rMult;
      if(v > 0) { wins++; gp += v; }
      else if(v < 0) gl += -v;
   }
   if(gl > 0) pf = gp / gl;
   else pf = (gp > 0) ? 999.0 : 0.0;
   if(n > 0) avgR = rsum / n;
}

void RefreshStatsText()
{
   int n, wins; double net, pf, avgR;
   CalcStats(n, wins, net, pf, avgR);
   double wr = (n > 0) ? 100.0 * wins / n : 0;
   SetText(I_J1, StringFormat("%d trades  /  %.0f%% win  /  PF %.2f", n, wr, pf));
   SetText(I_J2, "Net " + Money(net) + "  /  R " + DoubleToString(avgR, 2));
   SetColor(I_J2, net >= 0 ? g_buy : g_sell);
   string rateTxt = (InpUsdToman > 0 && !g_private) ? "  |  1 USD = " + Thousands(InpUsdToman) + " T" : "";
   SetText(I_J4, "Period: " + PeriodLabel() + rateTxt);
}

string Csv(string s)
{
   StringReplace(s, "\"", "\"\"");
   StringReplace(s, "\r", " ");
   StringReplace(s, "\n", " ");
   return "\"" + s + "\"";
}

#define CSV_COLS 27

string BuildCSV()
{
   string nl = "\r\n";
   string s = "#,Ticket,Symbol,Type,Volume,OpenTime,OpenPrice,InitSL,InitTP,LastSL,RiskFreeTime,CloseTime,ClosePrice,CloseReason,DurationMin,Points,Profit,Commission,Swap,Net,R,MAE_pts,MFE_pts,Balance,UsdToman,NetToman,Note" + nl;
   int n = ArraySize(g_trades);
   for(int i = 0; i < n; i++)
   {
      TradeRec r = g_trades[i];
      double dur = (r.openTime > 0) ? (double)(r.closeTime - r.openTime) / 60.0 : 0;
      s += IntegerToString(i + 1) + ",";
      s += (string)r.posId + ",";
      s += _Symbol + ",";
      s += r.type + ",";
      s += DoubleToString(r.volume, 2) + ",";
      s += TimeToString(r.openTime, TIME_DATE | TIME_SECONDS) + ",";
      s += DoubleToString(r.openPrice, _Digits) + ",";
      s += DoubleToString(r.sl, _Digits) + ",";
      s += DoubleToString(r.tp, _Digits) + ",";
      s += DoubleToString(r.lastSl, _Digits) + ",";
      s += (r.rfTime > 0 ? TimeToString(r.rfTime, TIME_DATE | TIME_SECONDS) : "") + ",";
      s += TimeToString(r.closeTime, TIME_DATE | TIME_SECONDS) + ",";
      s += DoubleToString(r.closePrice, _Digits) + ",";
      s += r.reason + ",";
      s += DoubleToString(dur, 1) + ",";
      s += DoubleToString(r.points, 0) + ",";
      s += DoubleToString(r.profit, 2) + ",";
      s += DoubleToString(r.commission, 2) + ",";
      s += DoubleToString(r.swap, 2) + ",";
      s += DoubleToString(r.net, 2) + ",";
      s += DoubleToString(r.rMult, 2) + ",";
      s += DoubleToString(r.mae, 0) + ",";
      s += DoubleToString(r.mfe, 0) + ",";
      s += DoubleToString(r.balance, 2) + ",";
      s += DoubleToString(r.rate, 0) + ",";
      s += DoubleToString(r.net * r.rate, 0) + ",";
      s += Csv(r.note) + nl;
   }

   int cnt, wins; double net, pf, avgR;
   CalcStats(cnt, wins, net, pf, avgR);
   s += nl;
   s += "Summary" + nl;
   s += "Trades," + IntegerToString(cnt) + nl;
   s += "Wins," + IntegerToString(wins) + nl;
   s += "WinRate%," + DoubleToString(cnt > 0 ? 100.0 * wins / cnt : 0, 1) + nl;
   s += "NetProfit," + DoubleToString(net, 2) + nl;
   s += "ProfitFactor," + DoubleToString(pf, 2) + nl;
   s += "AvgR," + DoubleToString(avgR, 2) + nl;
   return s;
}

// ---- journal period (the journal starts fresh at each period) ----
struct SavedRow
{
   ulong    posId;
   datetime closeTime;      // 0 = position closed while tracked (live data, no exact close time)
   double   sl, tp, lastSl;
   datetime rfTime;
   string   note;
   double   mae, mfe, rMult;   // from the CSV
   double   balance;           // from the CSV
   double   rate;              // Toman per USD stored with the row (0 = unknown)
   bool     hasTrk;            // live tracking data present
   double   maxp, minp, risk;  // live tracking data
};
SavedRow g_saved[];

datetime PeriodStart()
{
   if(InpJournalPeriod == JP_ALL) return 0;
   MqlDateTime t;
   TimeToStruct(TimeCurrent(), t);
   t.hour = 0; t.min = 0; t.sec = 0;
   datetime today = StructToTime(t);
   if(InpJournalPeriod == JP_DAY)  return today;
   if(InpJournalPeriod == JP_WEEK) return today - ((t.day_of_week + 6) % 7) * 86400;
   t.day = 1;
   return StructToTime(t);
}

string PeriodKey()
{
   if(InpJournalPeriod == JP_ALL) return "ALL";
   string d = SafeName(TimeToString(PeriodStart(), TIME_DATE));
   if(InpJournalPeriod == JP_DAY)  return "D" + d;
   if(InpJournalPeriod == JP_WEEK) return "W" + d;
   return "M" + d;
}

string PeriodLabel()
{
   if(InpJournalPeriod == JP_ALL) return "all trades";
   string d = TimeToString(PeriodStart(), TIME_DATE);
   if(InpJournalPeriod == JP_DAY)  return "day " + d;
   if(InpJournalPeriod == JP_WEEK) return "week from " + d;
   return "month " + StringSubstr(d, 0, 7);
}

// Read this period's CSV: notes, initial SL, MAE/MFE and balance per closing row.
void LoadSavedRows()
{
   ArrayResize(g_saved, 0);
   string txt;
   if(!ReadTextFile(JournalFile(), txt)) return;
   string lines[];
   int n = StringSplit(txt, '\n', lines);
   for(int i = 0; i < n; i++)
   {
      string ln = lines[i];
      StringReplace(ln, "\r", "");
      if(ln == "") break;                       // summary block starts after a blank line
      if(StringFind(ln, "#,") == 0) continue;   // header
      string f[];
      int c = StringSplit(ln, ',', f);
      if(c < CSV_COLS) continue;

      SavedRow s;
      s.posId     = (ulong)StringToInteger(f[1]);
      s.closeTime = StringToTime(f[11]);
      s.sl        = StringToDouble(f[7]);
      s.tp        = StringToDouble(f[8]);
      s.lastSl    = StringToDouble(f[9]);
      s.rfTime    = (f[10] == "") ? (datetime)0 : StringToTime(f[10]);
      s.rMult     = StringToDouble(f[20]);
      s.mae       = StringToDouble(f[21]);
      s.mfe       = StringToDouble(f[22]);
      s.balance   = StringToDouble(f[23]);
      s.rate      = StringToDouble(f[24]);
      s.hasTrk    = false;
      s.maxp = 0; s.minp = 0; s.risk = 0;
      string note = JoinFrom(f, 26, ",");
      if(StringLen(note) >= 2 && StringGetCharacter(note, 0) == '"')
      {
         note = StringSubstr(note, 1, StringLen(note) - 2);
         StringReplace(note, "\"\"", "\"");
      }
      s.note = note;
      int k = ArraySize(g_saved);
      ArrayResize(g_saved, k + 1);
      g_saved[k] = s;
   }
}

int FindSaved(ulong posId, datetime ct)
{
   int any = -1, zero = -1;
   for(int i = 0; i < ArraySize(g_saved); i++)
   {
      if(g_saved[i].posId != posId) continue;
      if(g_saved[i].closeTime == ct) return i;
      if(g_saved[i].closeTime == 0 && zero < 0) zero = i;
      if(any < 0) any = i;
   }
   return (zero >= 0) ? zero : any;
}

// Save the journal. The folder Common\Files\XauDesk is created at start-up.
bool ExportJournal(bool verbose)
{
   if(ArraySize(g_trades) == 0)
   {
      if(verbose) SetStatus("Journal is empty - nothing to save yet.");
      return false;
   }
   string s = BuildCSV();
   string path = JournalFile();
   if(!WriteTextFile(path, s))
   {
      int firstErr = g_fileErr;
      string alt = "XauDesk_Journal_" + SafeName(_Symbol) + "_" + IntegerToString(InpMagic) + ".csv";
      if(WriteTextFile(alt, s))
         path = alt;
      else
      {
         string hint = (firstErr == 5004 || g_fileErr == 5004) ? " - close the CSV in Excel" : "";
         SetStatus(StringFormat("Save failed (err %d)%s", g_fileErr, hint));
         return false;
      }
   }
   if(verbose)
   {
      string full = TerminalInfoString(TERMINAL_COMMONDATA_PATH) + "\\Files\\" + path;
      SetStatus("Journal saved: " + path);
      Print("[XauDesk] Journal saved to: ", full);
   }
   return true;
}

// Build one journal row from a closing deal. Numbers come from MT5 history;
// SL / note / MAE / MFE come from the CSV or live tracking when available.
bool BuildFromDeal(ulong outDeal, TradeRec &r)
{
   if(!HistoryDealSelect(outDeal)) return false;
   ulong    posId      = (ulong)HistoryDealGetInteger(outDeal, DEAL_POSITION_ID);
   datetime closeTime  = (datetime)HistoryDealGetInteger(outDeal, DEAL_TIME);
   double   closePrice = HistoryDealGetDouble(outDeal, DEAL_PRICE);
   ENUM_DEAL_REASON reason = (ENUM_DEAL_REASON)HistoryDealGetInteger(outDeal, DEAL_REASON);
   double outVol  = HistoryDealGetDouble(outDeal, DEAL_VOLUME);
   double outProf = HistoryDealGetDouble(outDeal, DEAL_PROFIT);
   double outComm = HistoryDealGetDouble(outDeal, DEAL_COMMISSION) + HistoryDealGetDouble(outDeal, DEAL_FEE);
   double outSwap = HistoryDealGetDouble(outDeal, DEAL_SWAP);

   r.posId = posId;
   r.type = "";
   r.volume = 0;
   r.openTime = 0;
   r.openPrice = 0;
   r.sl = 0; r.tp = 0; r.lastSl = 0; r.rfTime = 0;
   r.closeTime = closeTime;
   r.closePrice = closePrice;
   r.reason = ReasonText(reason);
   r.points = 0; r.profit = 0; r.commission = 0; r.swap = 0; r.net = 0;
   r.rMult = 0; r.mae = 0; r.mfe = 0; r.balance = 0; r.note = "";

   if(!HistorySelectByPosition(posId)) return false;
   int total = HistoryDealsTotal();
   double inVol = 0, inComm = 0, inPxVol = 0;
   int outCnt = 0;
   for(int i = 0; i < total; i++)
   {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0) continue;
      long en = HistoryDealGetInteger(d, DEAL_ENTRY);
      if(en == DEAL_ENTRY_IN)
      {
         double dv = HistoryDealGetDouble(d, DEAL_VOLUME);
         inVol   += dv;
         inComm  += HistoryDealGetDouble(d, DEAL_COMMISSION) + HistoryDealGetDouble(d, DEAL_FEE);
         inPxVol += HistoryDealGetDouble(d, DEAL_PRICE) * dv;
         if(r.openTime == 0) r.openTime = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
         r.type = (HistoryDealGetInteger(d, DEAL_TYPE) == DEAL_TYPE_BUY) ? "BUY" : "SELL";
      }
      else if(en == DEAL_ENTRY_OUT || en == DEAL_ENTRY_OUT_BY || en == DEAL_ENTRY_INOUT)
         outCnt++;
   }
   if(inVol > 0) r.openPrice = inPxVol / inVol;
   if(outCnt > 1 && r.reason == "Manual") r.reason = "Partial";

   double share = (inVol > 0) ? MathMin(1.0, outVol / inVol) : 1.0;
   r.volume     = outVol;
   r.profit     = outProf;
   r.commission = outComm + inComm * share;
   r.swap       = outSwap;
   r.net        = r.profit + r.commission + r.swap;

   bool isBuy = (r.type == "BUY");
   r.points = isBuy ? (r.closePrice - r.openPrice) / _Point : (r.openPrice - r.closePrice) / _Point;

   int si = FindSaved(posId, closeTime);
   r.rate = (si >= 0 && g_saved[si].rate > 0) ? g_saved[si].rate : InpUsdToman;
   if(si >= 0)
   {
      SavedRow s = g_saved[si];
      r.sl     = s.sl;
      r.tp     = s.tp;
      r.lastSl = s.lastSl;
      r.rfTime = s.rfTime;
      r.note   = s.note;
      if(s.hasTrk && r.openPrice > 0)
      {
         if(isBuy) { r.mae = (r.openPrice - s.minp) / _Point; r.mfe = (s.maxp - r.openPrice) / _Point; }
         else      { r.mae = (s.maxp - r.openPrice) / _Point; r.mfe = (r.openPrice - s.minp) / _Point; }
      }
      else { r.mae = s.mae; r.mfe = s.mfe; }
      if(s.risk > 0 && share > 0) r.rMult = r.net / (s.risk * share);
      else                        r.rMult = s.rMult;
      if(s.balance > 0) r.balance = s.balance;
   }
   if(r.balance <= 0) r.balance = AccountInfoDouble(ACCOUNT_BALANCE);
   return true;
}

// deals that belong to this panel (magic) and, optionally, manual deals made in the terminal
bool JournalMagicOK(long mg)
{
   return (mg == InpMagic) || (InpJournalManual && mg == 0);
}

// Rebuild the journal of the current period from MT5 history (the source of truth),
// so trades are never lost on recompile, restart or period change.
void RebuildJournal()
{
   LoadSavedRows();

   // positions closed while being tracked: keep their live data for the closing rows
   bool moved = false;
   for(int k = ArraySize(g_open) - 1; k >= 0; k--)
   {
      if(PositionExistsById(g_open[k].posId)) continue;
      SavedRow s;
      s.posId = g_open[k].posId;
      s.closeTime = 0;
      s.sl = g_open[k].sl; s.tp = g_open[k].tp; s.lastSl = g_open[k].lastSl; s.rfTime = g_open[k].rfTime;
      s.note = g_open[k].note;
      s.mae = 0; s.mfe = 0; s.rMult = 0; s.balance = 0; s.rate = 0;
      s.hasTrk = true; s.maxp = g_open[k].maxp; s.minp = g_open[k].minp; s.risk = g_open[k].risk;
      int m = ArraySize(g_saved);
      ArrayResize(g_saved, m + 1);
      g_saved[m] = s;
      RemoveOpen(k);
      moved = true;
   }

   ArrayResize(g_trades, 0);
   HistorySelect(PeriodStart(), TimeCurrent() + 86400);

   ulong outs[];
   int no = 0;
   int tot = HistoryDealsTotal();
   for(int i = 0; i < tot; i++)
   {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0) continue;
      if(HistoryDealGetString(d, DEAL_SYMBOL) != _Symbol) continue;
      if(!JournalMagicOK(HistoryDealGetInteger(d, DEAL_MAGIC))) continue;
      long en = HistoryDealGetInteger(d, DEAL_ENTRY);
      if(en != DEAL_ENTRY_OUT && en != DEAL_ENTRY_OUT_BY && en != DEAL_ENTRY_INOUT) continue;
      ArrayResize(outs, no + 1);
      outs[no++] = d;
   }
   for(int j = 0; j < no; j++)
   {
      TradeRec r;
      if(!BuildFromDeal(outs[j], r)) continue;
      int n = ArraySize(g_trades);
      ArrayResize(g_trades, n + 1);
      g_trades[n] = r;
   }

   RefreshStatsText();
   if(no > 0 && (InpAutoSave || moved)) ExportJournal(false);
   SetStatus(StringFormat("Journal: %d trades (%s)", ArraySize(g_trades), PeriodLabel()));
}







void UpdateBEButtons()
{
   int s = BEState();
   SetText(C_BEON, (s == 1) ? "BREAK-EVEN: ON" : "BREAK-EVEN: OFF");
   SetBG(C_BEON, (s == 1) ? g_btnOn : g_btn);
   SetColor(C_BEON, (s == 1) ? g_onText : g_muted);
}

void UpdateExecuteButton()
{
   if(g_auto)
   {
      SetText(C_EXEC, g_autoArmed ? "STOP" : "START");
      SetBG(C_EXEC, g_autoArmed ? g_sell : g_buy);
      SetColor(C_EXEC, clrWhite);
      return;
   }
   if(!g_lines)
   {
      SetText(C_EXEC, "LINES OFF");
      SetBG(C_EXEC, g_btn);
      SetColor(C_EXEC, g_muted);
   }
   else if(!g_plan.valid)
   {
      SetText(C_EXEC, "ADJUST SL / ENTRY");
      SetBG(C_EXEC, g_btn);
      SetColor(C_EXEC, g_muted);
   }
   else
   {
      SetText(C_EXEC, StringFormat("EXECUTE  %s  x%d", g_plan.typeText, g_plan.cnt));
      SetBG(C_EXEC, g_plan.isBuy ? g_buy : g_sell);
      SetColor(C_EXEC, clrWhite);
   }
}




//+------------------------------------------------------------------+
//| Buttons                                                           |
//+------------------------------------------------------------------+
void SetN(int v)
{
   v = (int)MathMax(1, MathMin(g_maxN, v));
   g_n = v;
   if(g_lines) BuildPlanLines();
}

// move the planned SL (only while no trade is open), keeping its side of the entry
void ReplanSL()
{
   int np, nq;
   CountGroup(np, nq);
   if(np + nq > 0 || !g_lines) return;
   if(ObjectFind(0, O_SL) < 0) return;
   double ref = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(g_pendMode && ObjectFind(0, PlanEntryName(1)) >= 0)
      ref = ObjectGetDouble(0, PlanEntryName(1), OBJPROP_PRICE);
   if(ref <= 0) return;
   double sl  = ObjectGetDouble(0, O_SL, OBJPROP_PRICE);
   double dir = (sl < ref) ? -1.0 : 1.0;
   ObjectSetDouble(0, O_SL, OBJPROP_PRICE, NormalizeDouble(ref + dir * SLDist(ref), _Digits));
   SavePlanLines();
}

void SetSLMode(int m)
{
   g_slMode = m;
   RefreshUI();
   ReplanSL();
}

void SetSLValue(double v)
{
   if(v <= 0) return;
   if(g_slMode == 0) g_slPts = v;
   else              g_slPct = v;
   ReplanSL();
}

void SwitchTheme()
{
   string note = GetNote();
   ApplyTheme((g_theme + 1) % 2);
   ApplyChartScheme();
   ObjectsDeleteAll(0, "BT_c_");
   ObjectsDeleteAll(0, "BT_i_");
   CreatePanels();
   ObjectSetString(0, C_NOTE, OBJPROP_TEXT, note);
   RefreshUI();
   RefreshStatsText();
}
// WEIGHTS shown as a ratio, e.g. 1:2:3
string WeightsText()
{
   string t = g_gridW;
   StringReplace(t, ",", ":");
   return t;
}

// next ratio in the list (click cycles through them)
void CycleWeights()
{
   string presets[] = {"1,1,1", "1,2,3", "3,2,1"};
   int idx = 0;
   for(int i = 0; i < ArraySize(presets); i++)
      if(presets[i] == g_gridW) idx = i;
   g_gridW = presets[(idx + 1) % ArraySize(presets)];
}

void HandleButton(string name)
{
   uint now = GetTickCount();
   bool dup = (name == g_lastBtn && (now - g_lastBtnTick) < 100);
   ObjectSetInteger(0, name, OBJPROP_STATE, false);
   if(dup) return;
   g_lastBtn = name;
   g_lastBtnTick = now;
   if(InpDebug) Print("[XauDesk] button: ", name);

   else if(name == C_HEDGE)
   {
      g_hedge = !g_hedge;
      if(g_hedge) { g_dual = false; SetText(C_DUAL, "DUAL: OFF"); SetBG(C_DUAL, g_btn); }
      SetText(C_HEDGE, g_hedge ? "HEDGE: ON" : "HEDGE: OFF");
      SetBG(C_HEDGE, g_hedge ? g_btnOn : g_btn);
      SetStatus(g_hedge ? "HEDGE on: a losing entry is hedged with 2x volume" : "HEDGE off");
   }
   else if(name == C_DUAL)
   {
      g_dual = !g_dual;
      if(g_dual) { g_hedge = false; SetText(C_HEDGE, "HEDGE: OFF"); SetBG(C_HEDGE, g_btn); }
      SetText(C_DUAL, g_dual ? "DUAL: ON" : "DUAL: OFF");
      SetBG(C_DUAL, g_dual ? g_btnOn : g_btn);
      SetStatus(g_dual ? "DUAL on: EXECUTE places BUY and SELL on the entry line" : "DUAL off");
   }
   else if(StringFind(name, "BT_RSD_TOG_") == 0)
   {
      int rn = (int)StringToInteger(StringSubstr(name, 11)) - 1;   // "BT_RSD_TOG_" has 11 characters
      g_rsiShow[rn] = !g_rsiShow[rn];
      SetStatus(StringFormat("RSI %d is now %s", rn + 1, g_rsiShow[rn] ? "shown" : "hidden"));
   }
   else if(StringFind(name,"BT_RSSET_")==0)
   {
      string parts[]; int n=StringSplit(name,'_',parts);
      if(n==5)
      {
         int panel=(int)StringToInteger(parts[2]);
         int field=(int)StringToInteger(parts[3]);
         int dir=(int)StringToInteger(parts[4]);
         int delta=(dir==1 ? 1 : -1);
         if(panel==1)
         {
            if(field==0) g_arsiP=(int)MathMax(2,MathMin(100,g_arsiP+delta));
            else if(field==1) g_r1TfSetting=(int)CycleRsiTf((ENUM_TIMEFRAMES)g_r1TfSetting,delta);
            else if(field==2) g_rsi1BuyMin=(int)MathMax(0,MathMin(g_rsi1BuyMax-1,g_rsi1BuyMin+delta));
            else if(field==3) g_rsi1BuyMax=(int)MathMax(g_rsi1BuyMin+1,MathMin(100,g_rsi1BuyMax+delta));
            else if(field==4) g_rsi1SellMin=(int)MathMax(0,MathMin(g_rsi1SellMax-1,g_rsi1SellMin+delta));
            else if(field==5) g_rsi1SellMax=(int)MathMax(g_rsi1SellMin+1,MathMin(100,g_rsi1SellMax+delta));
            
         }
         else
         {
            if(panel==2)
            {
               if(field==0) g_r2TfSetting=(int)CycleRsiTf((ENUM_TIMEFRAMES)g_r2TfSetting,delta);
               else if(field==1) g_r2P=(int)MathMax(2,MathMin(100,g_r2P+delta));
               else if(field==2) g_r2BuyLowMin=(int)MathMax(0,MathMin(g_r2BuyLowMax-1,g_r2BuyLowMin+delta));
               else if(field==3) g_r2BuyLowMax=(int)MathMax(g_r2BuyLowMin+1,MathMin(100,g_r2BuyLowMax+delta));
               else if(field==4) g_r2SellMin=(int)MathMax(0,MathMin(g_r2SellMax-1,g_r2SellMin+delta));
               else if(field==5) g_r2SellMax=(int)MathMax(g_r2SellMin+1,MathMin(100,g_r2SellMax+delta));
               else if(field==6) g_r2BuyMin=(int)MathMax(0,MathMin(g_r2BuyMax-1,g_r2BuyMin+delta));
               else if(field==7) g_r2BuyMax=(int)MathMax(g_r2BuyMin+1,MathMin(100,g_r2BuyMax+delta));
               else if(field==8) g_r2SellHighMin=(int)MathMax(0,MathMin(g_r2SellHighMax-1,g_r2SellHighMin+delta));
               else if(field==9) g_r2SellHighMax=(int)MathMax(g_r2SellHighMin+1,MathMin(100,g_r2SellHighMax+delta));
               g_r2Last=-1; g_r2CalcTick=0;
            }
            else if(panel==3)
            {
               if(field==0) g_r3TfSetting=(int)CycleRsiTf((ENUM_TIMEFRAMES)g_r3TfSetting,delta);
               else if(field==1) g_r3P=(int)MathMax(2,MathMin(100,g_r3P+delta));
               else if(field==2) g_r3BuyLowMin=(int)MathMax(0,MathMin(g_r3BuyLowMax-1,g_r3BuyLowMin+delta));
               else if(field==3) g_r3BuyLowMax=(int)MathMax(g_r3BuyLowMin+1,MathMin(100,g_r3BuyLowMax+delta));
               else if(field==4) g_r3SellMin=(int)MathMax(0,MathMin(g_r3SellMax-1,g_r3SellMin+delta));
               else if(field==5) g_r3SellMax=(int)MathMax(g_r3SellMin+1,MathMin(100,g_r3SellMax+delta));
               else if(field==6) g_r3BuyMin=(int)MathMax(0,MathMin(g_r3BuyMax-1,g_r3BuyMin+delta));
               else if(field==7) g_r3BuyMax=(int)MathMax(g_r3BuyMin+1,MathMin(100,g_r3BuyMax+delta));
               else if(field==8) g_r3SellHighMin=(int)MathMax(0,MathMin(g_r3SellHighMax-1,g_r3SellHighMin+delta));
               else if(field==9) g_r3SellHighMax=(int)MathMax(g_r3SellHighMin+1,MathMin(100,g_r3SellHighMax+delta));
               g_r3Last=-1; g_r3CalcTick=0;
            }
         }
         
      }
   }
   else if(name == C_EXEC)
   {
      if(g_auto)
      {
         if(g_autoArmed) { g_autoArmed=false; SetStatus("AUTO stopped: no new trades"); }
         else
         {
            int ad=0;
            if(AutoPosCount(ad)>0) SetStatus("AUTO: close the open trades first");
            else
            {
               g_autoArmed=true;
               g_autoBar=iTime(_Symbol,_Period,0);
               SetStatus(g_gridRsi ? "AUTO armed: RSI grid, one trade per signal" : "AUTO armed: one trade per signal");
            }
         }
      }
      else Execute();
   }
   else if(name == C_CLOSEALL)    CloseAllPositions();
   else if(name == C_CANCEL)      CancelPendings();
   else if(name == C_BEON)
   {
      if(BEState() == 1) BreakevenOff();
      else               BreakevenOn();
   }
   else if(name == C_BEOFF)       BreakevenOff();
   else if(name == C_CSV)         ExportJournal(true);
   else if(name == C_THEME)       SwitchTheme();
   else if(name == C_LINES)
   {
      g_lines = !g_lines;
      if(g_lines) BuildPlanLines();
      else        DeleteAllPlanLines(true);   // positions are remembered for the next time
   }
   else if(name == C_MKT || name == C_PEND)
   {
      g_pendMode = (name == C_PEND);
      if(!g_pendMode && g_grid) { g_grid = false; RebuildControl(); }
      if(g_lines) BuildPlanLines();
   }
   else if(name == C_LOT || name == C_RISK)
      g_riskMode = (name == C_RISK);
   else if(name == C_RRM || name == C_PCT)
      g_tpMode = (name == C_PCT) ? 1 : 0;
   else if(name == C_VMINUS || name == C_VPLUS)
   {
      double step = g_riskMode ? 0.25 : SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
      if(step <= 0) step = 0.01;
      double dir = (name == C_VPLUS) ? 1.0 : -1.0;
      SetVol(NormalizeDouble(MathMax(step, GetVol() + dir * step), 4));
   }
   else if(name == C_NMINUS)  SetN(g_n - 1);
   else if(name == C_NPLUS)   SetN(g_n + 1);
   else if(name == C_Q1)      SetTPValue(1.0);
   else if(name == C_Q2)      SetTPValue(2.0);
   else if(name == C_Q3)      SetTPValue(3.0);
   else if(name == C_BMIN_M) { g_rsi1BuyMin = MathMax(0, MathMin(g_rsi1BuyMax-1, g_rsi1BuyMin-1)); }
   else if(name == C_BMIN_P) { g_rsi1BuyMin = MathMin(g_rsi1BuyMax-1, g_rsi1BuyMin+1); }
   else if(name == C_BMAX_M) { g_rsi1BuyMax = MathMax(g_rsi1BuyMin+1, g_rsi1BuyMax-1); }
   else if(name == C_BMAX_P) { g_rsi1BuyMax = MathMin(100, g_rsi1BuyMax+1); }
   else if(name == C_SMIN_M) { g_rsi1SellMin = MathMax(0, MathMin(g_rsi1SellMax-1, g_rsi1SellMin-1)); }
   else if(name == C_SMIN_P) { g_rsi1SellMin = MathMin(g_rsi1SellMax-1, g_rsi1SellMin+1); }
   else if(name == C_SMAX_M) { g_rsi1SellMax = MathMax(g_rsi1SellMin+1, g_rsi1SellMax-1); }
   else if(name == C_SMAX_P) { g_rsi1SellMax = MathMin(100, g_rsi1SellMax+1); }
   else if(name == C_WGT)
      CycleWeights();
   else if(name == C_W1)  g_gridW = "1,1,1";
   else if(name == C_W2)  g_gridW = "1,2,3";
   else if(name == C_W3)  g_gridW = "3,2,1";
   else if(name == C_GRID)
   {
      if(!AutoLocked())
      {
         int gs = g_grid ? 1 : (g_gridRsi ? 2 : 0);
         int nx = (gs == 1) ? 0 : 1;   // AUTO removed: the grid is the price grid only
         g_grid    = (nx == 1);
         g_gridRsi = (nx == 2);
         if(nx == 1) { g_auto = false; g_pendMode = true; }
         g_autoArmed = false;
         SetStatus(nx == 1 ? "GRID: price grid" : (nx == 2 ? "GRID: RSI grid - the AUTO button starts it" : "GRID off"));
         RebuildControl();
         if(g_lines) BuildPlanLines();
      }
   }
   else if(name == C_FOLD)    SetFold(!g_ctlFold);
   else if(name == C_ARROW)
   {
      g_dashShown = !g_dashShown;
      SetDashVisible(g_dashShown);
   }
   else if(name == C_PRIV)    g_private = !g_private;
   else if(name == C_SLPTS)   SetSLMode(0);
   else if(name == C_SLPCT)   SetSLMode(1);
   else if(name == C_R1)      ReducePositions(InpReduceP1);
   else if(name == C_R2)      ReducePositions(InpReduceP2);
   else if(name == C_R3)      ReducePositions(InpReduceP3);
   else if(name == C_R4)      ReducePositions(InpReduceP4);

   RefreshUI();
   SaveSettings();
   ChartRedraw();
}

void PollButtons()
{
   int n = ArraySize(g_btns);
   for(int i = 0; i < n && i < ArraySize(g_btns); i++)
   {
      string nm = g_btns[i];
      if(ObjectFind(0, nm) < 0) continue;
      if(ObjectGetInteger(0, nm, OBJPROP_STATE) != 0)
         HandleButton(nm);
   }
}

//+------------------------------------------------------------------+
//| Events                                                            |
//+------------------------------------------------------------------+
// chart colours of the current theme (CS_OFF leaves the chart alone)
void ApplyChartScheme()
{
   if(InpChartScheme == CS_OFF) return;
   ChartSetInteger(0, CHART_COLOR_BACKGROUND, c_bg);
   ChartSetInteger(0, CHART_COLOR_FOREGROUND, c_fg);
   color bull = (g_theme == 4) ? C'6,6,28' : c_up;
   color bear = (g_theme == 4) ? clrWhite : c_dn;
   ChartSetInteger(0, CHART_COLOR_CANDLE_BULL, bull);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BEAR, bear);
   ChartSetInteger(0, CHART_COLOR_CHART_UP, c_up);
   ChartSetInteger(0, CHART_COLOR_CHART_DOWN, c_dn);
   ChartSetInteger(0, CHART_COLOR_CHART_LINE, c_fg);
   ChartSetInteger(0, CHART_COLOR_VOLUME, g_accent);
   ChartSetInteger(0, CHART_COLOR_GRID, c_grid);
   ChartRedraw();
}

// ---- radar: indicator analysis with a status per indicator and a signal ----
// Every reading is taken on the last closed bar. Scored items give +1 (bull), -1 (bear) or 0.
// Signals support the decision; they are not guaranteed.
uint   g_radLast = 0;
string g_radSig  = "";
#define RAD_ROWS 25           // 0..14 scored, 15 = ATR, 16..17 = correlation, 18 = MA 120 side, 19..22 = MA reaction, 23..24 = position
#define RAD_SCORED 15
#define RAD_W 270



// one value of an indicator buffer at a shift; EMPTY_VALUE when it is not ready
double RV(int h, int buf, int shift)
{
   if(h == INVALID_HANDLE) return EMPTY_VALUE;
   double a[];
   if(CopyBuffer(h, buf, shift, 1, a) != 1) return EMPTY_VALUE;
   return a[0];
}

string BiasWord(int b) { return (b > 0) ? "BULL" : ((b < 0) ? "BEAR" : "NEUTRAL"); }
color  BiasColor(int b) { return (b > 0) ? g_buy : ((b < 0) ? g_sell : g_muted); }

void RadBox(string n, int x, int y, int w, int h, color bg)
{
   if(ObjectFind(0, n) < 0)
   {
      ObjectCreate(0, n, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   }
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, bg);
}

void RadLabel(string n, string txt, int x, int y, color clr, int size, string font)
{
   if(ObjectFind(0, n) < 0)
   {
      ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, n, OBJPROP_ZORDER, 5);
   }
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   if(ObjectGetString(0, n, OBJPROP_TEXT) != txt) ObjectSetString(0, n, OBJPROP_TEXT, txt);
   ObjectSetString(0, n, OBJPROP_FONT, FontFace(font, n));
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, FontPt(size, n));
   ObjectSetInteger(0, n, OBJPROP_COLOR, clr);
}

// correlation of this symbol with another one, over the last 50 closed bars (returns, Pearson)
bool CorrStat(string sym, double &corr, double &movePts, double &movePips)
{
   corr = 0; movePts = 0; movePips = 0;
   if(sym == "") return false;
   const int N = 50;
   double a[], b[];
   if(CopyClose(_Symbol, _Period, 1, N + 1, a) != N + 1) return false;
   if(CopyClose(sym, _Period, 1, N + 1, b) != N + 1) return false;
   double sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
   for(int i = 1; i <= N; i++)
   {
      double x = a[i] / a[i - 1] - 1.0;
      double y = b[i] / b[i - 1] - 1.0;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
   }
   double cov = sxy - sx * sy / N;
   double vx  = sxx - sx * sx / N;
   double vy  = syy - sy * sy / N;
   if(vx <= 0 || vy <= 0) return false;
   corr = cov / MathSqrt(vx * vy);
   double pt = SymbolInfoDouble(sym, SYMBOL_POINT);
   int    dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   if(pt <= 0) return false;
   movePts  = (b[N] - b[0]) / pt;
   movePips = movePts / ((dg == 3 || dg == 5) ? 10.0 : 1.0);
   return true;
}

// colour a blended with colour b (t = share of b); used to tone down the R:R fills
color MixColor(color a, color b, double t)
{
   int ar = (int)(a & 0xFF), ag = (int)((a >> 8) & 0xFF), ab = (int)((a >> 16) & 0xFF);
   int br = (int)(b & 0xFF), bg = (int)((b >> 8) & 0xFF), bb = (int)((b >> 16) & 0xFF);
   int r = (int)MathRound(ar * (1 - t) + br * t);
   int g = (int)MathRound(ag * (1 - t) + bg * t);
   int bl = (int)MathRound(ab * (1 - t) + bb * t);
   return (color)(r | (g << 8) | (bl << 16));
}

// R:R ruler for every open trade: profit zone (entry -> TP) and risk zone (entry -> initial SL).
// The initial SL is kept until the trade is closed, so the ruler does not move with break-even.
// a plain line in place of a filled block: cheap to draw and easy to read on any theme
// a plain straight segment; rebuilt on every change so that both anchors are always the new ones
string g_rrSig[2];   // last drawn state of the ruler (per side)

void RulerLine(string nm, datetime t1, double p1, datetime t2, double p2, color clr, ENUM_LINE_STYLE st = STYLE_SOLID)
{
   if(ObjectFind(0, nm) >= 0) ObjectDelete(0, nm);
   ObjectCreate(0, nm, OBJ_TREND, 0, t1, p1, t2, p2);
   ObjectSetInteger(0, nm, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, nm, OBJPROP_STYLE, st);
   ObjectSetInteger(0, nm, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, nm, OBJPROP_BACK, true);
}

void DrawRRRulers()
{
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   if(bal <= 0) bal = 1;
   // one ruler per direction: a grid is one trade - farthest entry to the shared SL and the farthest TP
   for(int side = 0; side < 2; side++)
   {
      bool wantBuy = (side == 0);
      int n = 0;
      double entryFar = 0, tpFar = 0, slFar = 0, pnl = 0, risk = 0;
      datetime t0 = 0;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         ulong tk = PositionGetTicket(i);
         if(tk == 0) continue;
         if(!IsOurPosition()) continue;
         bool isBuy = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
         if(isBuy != wantBuy) continue;
         double op  = PositionGetDouble(POSITION_PRICE_OPEN);
         double tp  = PositionGetDouble(POSITION_TP);
         double vl  = PositionGetDouble(POSITION_VOLUME);
         double sl0 = PositionGetDouble(POSITION_SL);
         datetime ot = (datetime)PositionGetInteger(POSITION_TIME);
         ulong posId = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
         double rk = 0;
         int k = FindOpen(posId);
         if(k >= 0) { if(g_open[k].sl > 0) sl0 = g_open[k].sl; rk = g_open[k].risk; }
         if(rk <= 0 && sl0 > 0)
         {
            double pr = 0;
            if(OrderCalcProfit(isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, _Symbol, vl, op, sl0, pr)) rk = MathAbs(pr);
         }
         pnl  += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
         risk += rk;
         if(n == 0 || (t0 > 0 && ot < t0)) t0 = ot;
         if(n == 0)
         {
            entryFar = op; tpFar = tp; slFar = sl0;
         }
         else
         {
            if(wantBuy ? (op < entryFar) : (op > entryFar)) entryFar = op;
            if(tp > 0 && (tpFar <= 0 || (wantBuy ? (tp > tpFar) : (tp < tpFar)))) tpFar = tp;
            if(sl0 > 0 && (slFar <= 0 || (wantBuy ? (sl0 < slFar) : (sl0 > slFar)))) slFar = sl0;
         }
         n++;
      }
      if(n == 0)
      {
         string sid0 = IntegerToString(side);
         ObjectDelete(0, "BT_rr_e" + sid0); ObjectDelete(0, "BT_rr_p" + sid0); ObjectDelete(0, "BT_rr_r" + sid0); ObjectDelete(0, "BT_rr_t" + sid0);
         continue;
      }

      double rNow = (risk > 0) ? pnl / risk : 0;
      double rr = (tpFar > 0 && slFar > 0 && MathAbs(entryFar - slFar) > 0) ? MathAbs(tpFar - entryFar) / MathAbs(entryFar - slFar) : 0;
      datetime t2 = TimeCurrent() + PeriodSeconds(_Period) * 15;
      string sd = wantBuy ? "BUY" : "SELL";
      string sid = IntegerToString(side);
      string rsig = StringFormat("%d|%.5f|%.5f|%.5f", n, entryFar, tpFar, slFar);
      if(rsig == g_rrSig[side]) continue;          // same trade data: nothing to redraw
      g_rrSig[side] = rsig;

      RulerLine("BT_rr_e" + sid, t0, entryFar, t2, entryFar, g_text, STYLE_DOT);
      if(tpFar > 0) RulerLine("BT_rr_p" + sid, t0, tpFar, t2, tpFar, g_buy);
      else ObjectDelete(0, "BT_rr_p" + sid);
      if(slFar > 0) RulerLine("BT_rr_r" + sid, t0, slFar, t2, slFar, g_sell);
      else ObjectDelete(0, "BT_rr_r" + sid);
      string tn = "BT_rr_t" + sid;
      if(ObjectFind(0, tn) < 0) ObjectCreate(0, tn, OBJ_TEXT, 0, t2, entryFar);
      ObjectMove(0, tn, 0, t2, entryFar);
      ObjectSetString(0, tn, OBJPROP_TEXT, StringFormat("%s  x%d  |  RR 1:%.2f  |  R now %.2f  |  %s",
                      sd, n, rr, rNow, Money(pnl)));
      ObjectSetInteger(0, tn, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
      ObjectSetInteger(0, tn, OBJPROP_COLOR, g_text);
      ObjectSetString(0, tn, OBJPROP_FONT, FontFace("Segoe UI Semibold", tn));
      ObjectSetInteger(0, tn, OBJPROP_FONTSIZE, FontPt(8, tn));
      ObjectSetInteger(0, tn, OBJPROP_SELECTABLE, false);
   }
}

// ---- key levels: H1, H4, D1 high / low / 50% of the last closed candle ----
// Segments run from the candle that formed the level to 3 bars ahead. Labels are placed
// on the right, spread apart so they do not overlap. Breaks (BRK / FAKE) are marked on the bar.


// label in pixels (right side), so it can be spread apart




// MA reaction on one timeframe, using the last closed bar.
//  trend   : MA 7 above 29 and price above MA 120 (up), or the mirror image (down)
//  touch   : the bar's range reaches an MA (99, then 29, then 7)
//  confirm : bar closes in the trend direction with its BODY on the trend side of that MA
//            (optional size limit: body <= InpReactMaxATR x ATR, 0 = no limit)
//  fake    : the bar touched the MA but closed on the wrong side

// Position of the last closed lower-timeframe bar inside the last closed higher-timeframe bar.
// txt  : "near HIGH 82%", "middle 50%", "near LOW 9%"
// stat : "BREAK UP" / "BREAK DN" when a jump bar breaks the higher bar's high / low, "jump" or "-"
// dir  : +1 / -1 for the breaks, 0 otherwise
void PosRow(ENUM_TIMEFRAMES lo, ENUM_TIMEFRAMES hi, string &txt, string &stat, int &dir)
{
   txt = "n/a"; stat = "-"; dir = 0;
   double hH = iHigh(_Symbol, hi, 1), hL = iLow(_Symbol, hi, 1);
   double lH = iHigh(_Symbol, lo, 1), lL = iLow(_Symbol, lo, 1), lC = iClose(_Symbol, lo, 1);
   if(hH <= hL || lH <= lL) return;

   double p = (lC - hL) / (hH - hL) * 100.0;
   string where = (p >= 75) ? "near HIGH" : ((p <= 25) ? "near LOW" : "middle");
   txt = where + " " + DoubleToString(p, 0) + "%";

   // jump: this bar's range or volume against the average of the 3 bars before it
   double rAvg = 0, vAvg = 0;
   for(int s = 2; s <= 4; s++)
   {
      rAvg += iHigh(_Symbol, lo, s) - iLow(_Symbol, lo, s);
      vAvg += (double)iVolume(_Symbol, lo, s);
   }
   rAvg /= 3.0; vAvg /= 3.0;
   double rNow = lH - lL, vNow = (double)iVolume(_Symbol, lo, 1);
   bool jump = (rAvg > 0 && rNow >= InpJumpMult * rAvg) || (vAvg > 0 && vNow >= InpJumpMult * vAvg);
   if(!jump) return;

   stat = "jump";
   if(lH > hH)      { stat = "BREAK UP";  dir = 1; }
   else if(lL < hL) { stat = "BREAK DN";  dir = -1; }
}

// ---- levels: last closed H1 / H4 / D1 high and low, drawn short (to 2 bars after the current bar),
// with the first break of each level marked (BRK) or marked as a fakeout (FAKE) when the next 2 bars close back





//+------------------------------------------------------------------+
//| FundTrack data: JSON lines in Terminal\Common\Files\FundTrack\    |
//| The dashboard reads the file; the EA only appends short lines.    |
//+------------------------------------------------------------------+
string   FT_Dir  = "FundTrack";
string   FT_File = "FundTrack\\events.jsonl";
datetime g_ftSnapAt = 0;

string FT_Esc(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
}
string FT_N(const double v, const int d = 2) { return DoubleToString(v, d); }
long   FT_Tz() { return (long)(TimeCurrent() - TimeGMT()); }   // broker server time minus UTC, seconds

void FT_Write(const string line)
{
   if(!InpFtEvents) return;
   int h = FileOpen(FT_File, FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ);
   if(h == INVALID_HANDLE) { Print("FundTrack: cannot open the events file, error ", GetLastError()); return; }
   FileSeek(h, 0, SEEK_END);
   FileWriteString(h, line + "\r\n");
   FileClose(h);
}

string FT_Meta()
{
   return StringFormat("{\"type\":\"meta\",\"t\":%I64d,\"login\":%I64d,\"name\":\"%s\",\"server\":\"%s\",\"cur\":\"%s\",\"tz\":%I64d,\"symbol\":\"%s\",\"period\":\"%s\"}",
                       (long)TimeGMT(), AccountInfoInteger(ACCOUNT_LOGIN), FT_Esc(AccountInfoString(ACCOUNT_NAME)),
                       FT_Esc(AccountInfoString(ACCOUNT_SERVER)), AccountInfoString(ACCOUNT_CURRENCY), FT_Tz(),
                       _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period));
}

void FT_Snapshot()
{
   FT_Write(StringFormat("{\"type\":\"snap\",\"t\":%I64d,\"login\":%I64d,\"bal\":%s,\"eq\":%s,\"fl\":%s,\"margin\":%s,\"free\":%s}",
                         (long)TimeGMT(), AccountInfoInteger(ACCOUNT_LOGIN),
                         FT_N(AccountInfoDouble(ACCOUNT_BALANCE)), FT_N(AccountInfoDouble(ACCOUNT_EQUITY)),
                         FT_N(AccountInfoDouble(ACCOUNT_PROFIT)), FT_N(AccountInfoDouble(ACCOUNT_MARGIN)),
                         FT_N(AccountInfoDouble(ACCOUNT_MARGIN_FREE))));
}

void FT_Positions()
{
   string items = "";
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(items != "") items += ",";
      items += StringFormat("{\"ticket\":%I64u,\"sym\":\"%s\",\"side\":%d,\"vol\":%s,\"open\":%s,\"sl\":%s,\"tp\":%s,\"profit\":%s,\"magic\":%I64d,\"time\":%I64d}",
                            tk, FT_Esc(PositionGetString(POSITION_SYMBOL)), (int)PositionGetInteger(POSITION_TYPE),
                            FT_N(PositionGetDouble(POSITION_VOLUME)), FT_N(PositionGetDouble(POSITION_PRICE_OPEN), 5),
                            FT_N(PositionGetDouble(POSITION_SL), 5), FT_N(PositionGetDouble(POSITION_TP), 5),
                            FT_N(PositionGetDouble(POSITION_PROFIT)), PositionGetInteger(POSITION_MAGIC),
                            PositionGetInteger(POSITION_TIME) - FT_Tz());
   }
   FT_Write("{\"type\":\"positions\",\"t\":" + IntegerToString((long)TimeGMT()) + ",\"items\":[" + items + "]}");
}

// one deal: the dashboard pairs IN and OUT deals by position id
string FT_DealLine(const ulong d)
{
   return StringFormat("{\"type\":\"deal\",\"t\":%I64d,\"deal\":%I64u,\"order\":%I64d,\"pos\":%I64d,\"sym\":\"%s\",\"entry\":%d,\"side\":%d,\"vol\":%s,\"price\":%s,\"profit\":%s,\"comm\":%s,\"swap\":%s,\"fee\":%s,\"magic\":%I64d,\"comment\":\"%s\"}",
                         HistoryDealGetInteger(d, DEAL_TIME) - FT_Tz(), d, HistoryDealGetInteger(d, DEAL_ORDER),
                         HistoryDealGetInteger(d, DEAL_POSITION_ID), FT_Esc(HistoryDealGetString(d, DEAL_SYMBOL)),
                         (int)HistoryDealGetInteger(d, DEAL_ENTRY), (int)HistoryDealGetInteger(d, DEAL_TYPE),
                         FT_N(HistoryDealGetDouble(d, DEAL_VOLUME)), FT_N(HistoryDealGetDouble(d, DEAL_PRICE), 5),
                         FT_N(HistoryDealGetDouble(d, DEAL_PROFIT)), FT_N(HistoryDealGetDouble(d, DEAL_COMMISSION)),
                         FT_N(HistoryDealGetDouble(d, DEAL_SWAP)), FT_N(HistoryDealGetDouble(d, DEAL_FEE)),
                         HistoryDealGetInteger(d, DEAL_MAGIC), FT_Esc(HistoryDealGetString(d, DEAL_COMMENT)));
}

void FT_Deal(const ulong d)
{
   FT_Write(FT_DealLine(d));
}

// once per account: every deal since InpBackfillFrom, written in small steps from the timer
bool     g_bfActive = false;
int      g_bfPos    = 0;
int      g_bfTotal  = 0;
string   g_bfMarker = "";

void FT_BackfillStart()
{
   if(!InpFtEvents) return;
   g_bfMarker = FT_Dir + "\\backfill_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".done";
   if(FileIsExist(g_bfMarker, FILE_COMMON)) return;
   datetime from = StringToTime(InpBackfillFrom + " 00:00");
   if(!HistorySelect(from, TimeCurrent() + 86400)) { Print("FundTrack: history select failed"); return; }
   g_bfTotal  = HistoryDealsTotal();
   g_bfPos    = 0;
   g_bfActive = true;
   Print("FundTrack: importing ", g_bfTotal, " deals since ", InpBackfillFrom);
}

// called every second: up to 400 deals per step, collected into one text block and written once
void FT_BackfillStep()
{
   if(!g_bfActive) return;
   string block = "";
   int end = MathMin(g_bfTotal, g_bfPos + 400);
   for(int i = g_bfPos; i < end; i++)
   {
      ulong d = HistoryDealGetTicket(i);
      if(d != 0) block += FT_DealLine(d) + "\r\n";
   }
   if(StringLen(block) > 0)
   {
      int h = FileOpen(FT_File, FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ);
      if(h != INVALID_HANDLE) { FileSeek(h, 0, SEEK_END); FileWriteString(h, block); FileClose(h); }
   }
   g_bfPos = end;
   if(g_bfPos >= g_bfTotal)
   {
      int m = FileOpen(g_bfMarker, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
      if(m != INVALID_HANDLE) { FileWriteString(m, "ok"); FileClose(m); }
      g_bfActive = false;
      Print("FundTrack: import finished, ", g_bfTotal, " deals");
   }
}



// ---- market radar: closed-candle indicator values and levels, one JSON line per timeframe ----
struct RadarTf
{
   ENUM_TIMEFRAMES tf;
   int hATR, hRSI, hE9, hE21, hE50, hE200, hADX, hMACD, hBB;
};
RadarTf g_rad[4];
datetime g_radPubLast = 0;

bool RadarInit()
{
   ENUM_TIMEFRAMES tfs[4] = {PERIOD_M1, PERIOD_M15, PERIOD_H1, PERIOD_H4};
   for(int k = 0; k < 4; k++)
   {
      g_rad[k].tf    = tfs[k];
      g_rad[k].hATR  = iATR(_Symbol, tfs[k], 14);
      g_rad[k].hRSI  = iRSI(_Symbol, tfs[k], 14, PRICE_CLOSE);
      g_rad[k].hE9   = iMA(_Symbol, tfs[k], 9, 0, MODE_EMA, PRICE_CLOSE);
      g_rad[k].hE21  = iMA(_Symbol, tfs[k], 21, 0, MODE_EMA, PRICE_CLOSE);
      g_rad[k].hE50  = iMA(_Symbol, tfs[k], 50, 0, MODE_EMA, PRICE_CLOSE);
      g_rad[k].hE200 = iMA(_Symbol, tfs[k], 200, 0, MODE_EMA, PRICE_CLOSE);
      g_rad[k].hADX  = iADX(_Symbol, tfs[k], 14);
      g_rad[k].hMACD = iMACD(_Symbol, tfs[k], 12, 26, 9, PRICE_CLOSE);
      g_rad[k].hBB   = iBands(_Symbol, tfs[k], 20, 0, 2.0, PRICE_CLOSE);
      if(g_rad[k].hATR == INVALID_HANDLE || g_rad[k].hRSI == INVALID_HANDLE || g_rad[k].hE9 == INVALID_HANDLE ||
         g_rad[k].hE21 == INVALID_HANDLE || g_rad[k].hE50 == INVALID_HANDLE || g_rad[k].hE200 == INVALID_HANDLE ||
         g_rad[k].hADX == INVALID_HANDLE || g_rad[k].hMACD == INVALID_HANDLE || g_rad[k].hBB == INVALID_HANDLE)
         return false;
   }
   return true;
}

void RadarRelease()
{
   for(int k = 0; k < 4; k++)
   {
      IndicatorRelease(g_rad[k].hATR); IndicatorRelease(g_rad[k].hRSI); IndicatorRelease(g_rad[k].hE9);
      IndicatorRelease(g_rad[k].hE21); IndicatorRelease(g_rad[k].hE50); IndicatorRelease(g_rad[k].hE200);
      IndicatorRelease(g_rad[k].hADX); IndicatorRelease(g_rad[k].hMACD); IndicatorRelease(g_rad[k].hBB);
   }
}

// the last two confirmed fractal swing highs and lows (2 bars on each side)
void RadarSwings(const ENUM_TIMEFRAMES tf, double &hi[], double &lo[])
{
   ArrayResize(hi, 0); ArrayResize(lo, 0);
   double H[], L[];
   ArraySetAsSeries(H, true); ArraySetAsSeries(L, true);
   int n = 60;
   if(CopyHigh(_Symbol, tf, 1, n, H) < n || CopyLow(_Symbol, tf, 1, n, L) < n) return;
   for(int i = 2; i < n - 2 && (ArraySize(hi) < 2 || ArraySize(lo) < 2); i++)
   {
      bool isH = true, isL = true;
      for(int j = 1; j <= 2; j++)
      {
         if(H[i] <= H[i - j] || H[i] <= H[i + j]) isH = false;
         if(L[i] >= L[i - j] || L[i] >= L[i + j]) isL = false;
      }
      if(isH && ArraySize(hi) < 2) { ArrayResize(hi, ArraySize(hi) + 1); hi[ArraySize(hi) - 1] = H[i]; }
      if(isL && ArraySize(lo) < 2) { ArrayResize(lo, ArraySize(lo) + 1); lo[ArraySize(lo) - 1] = L[i]; }
   }
}

// one line for one timeframe: every value is raw (prices, points, ratios); scoring is done in Python
void RadarTfLine(const int k)
{
   ENUM_TIMEFRAMES tf = g_rad[k].tf;
   double atr = RV(g_rad[k].hATR, 0, 1);
   if(atr == EMPTY_VALUE || atr <= 0) return;
   double close1 = iClose(_Symbol, tf, 1);
   double close4 = iClose(_Symbol, tf, 4);

   // ATR ratio against its own 100-candle average
   double abuf[]; ArraySetAsSeries(abuf, true);
   double atrAvg = 0;
   if(CopyBuffer(g_rad[k].hATR, 0, 1, 100, abuf) == 100)
   {
      for(int i = 0; i < 100; i++) atrAvg += abuf[i];
      atrAvg /= 100.0;
   }
   double ratio = (atrAvg > 0) ? atr / atrAvg : 0;

   double rsi = RV(g_rad[k].hRSI, 0, 1), rsiPrev = RV(g_rad[k].hRSI, 0, 4);
   double e9 = RV(g_rad[k].hE9, 0, 1), e21 = RV(g_rad[k].hE21, 0, 1);
   double e50 = RV(g_rad[k].hE50, 0, 1), e200 = RV(g_rad[k].hE200, 0, 1);
   double adx = RV(g_rad[k].hADX, 0, 1), pdi = RV(g_rad[k].hADX, 1, 1), mdi = RV(g_rad[k].hADX, 2, 1);
   double macdM = RV(g_rad[k].hMACD, 0, 1), macdS = RV(g_rad[k].hMACD, 1, 1);
   double macdM2 = RV(g_rad[k].hMACD, 0, 2), macdS2 = RV(g_rad[k].hMACD, 1, 2);
   double bbMid = RV(g_rad[k].hBB, 0, 1), bbUp = RV(g_rad[k].hBB, 1, 1), bbLo = RV(g_rad[k].hBB, 2, 1);
   if(rsi == EMPTY_VALUE || e9 == EMPTY_VALUE || e200 == EMPTY_VALUE || adx == EMPTY_VALUE || macdM == EMPTY_VALUE || bbUp == EMPTY_VALUE) return;

   // volume against its own 20-candle average (tick volume)
   double v1 = (double)iVolume(_Symbol, tf, 1), vavg = 0;
   for(int i = 1; i <= 20; i++) vavg += (double)iVolume(_Symbol, tf, i);
   vavg /= 20.0;

   double hi[], lo[];
   RadarSwings(tf, hi, lo);
   string shi = "", slo = "";
   for(int i = 0; i < ArraySize(hi); i++) shi += (i ? "," : "") + DoubleToString(hi[i], _Digits);
   for(int i = 0; i < ArraySize(lo); i++) slo += (i ? "," : "") + DoubleToString(lo[i], _Digits);

   // daily levels from the last closed daily candle
   double dH = iHigh(_Symbol, PERIOD_D1, 1), dL = iLow(_Symbol, PERIOD_D1, 1), dC = iClose(_Symbol, PERIOD_D1, 1);
   double pp = (dH + dL + dC) / 3.0;

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   string line = StringFormat(
      "{\"type\":\"radar\",\"t\":%I64d,\"tf\":\"%s\",\"sym\":\"%s\",\"bid\":%s,\"ask\":%s,\"spread\":%d,"
      "\"atr\":%s,\"atr_avg\":%s,\"atr_ratio\":%s,\"rsi\":%s,\"rsi_prev\":%s,"
      "\"ema9\":%s,\"ema21\":%s,\"ema50\":%s,\"ema200\":%s,\"close\":%s,\"close4\":%s,"
      "\"adx\":%s,\"pdi\":%s,\"mdi\":%s,\"macd\":%s,\"macd_sig\":%s,\"macd_prev\":%s,\"macd_sig_prev\":%s,"
      "\"bb_mid\":%s,\"bb_up\":%s,\"bb_lo\":%s,\"vol\":%s,\"vol_avg\":%s,"
      "\"swing_hi\":[%s],\"swing_lo\":[%s],"
      "\"d_hi\":%s,\"d_lo\":%s,\"pp\":%s,\"r1\":%s,\"s1\":%s}",
      (long)TimeGMT(), EnumToString(tf), _Symbol,
      DoubleToString(bid, _Digits), DoubleToString(ask, _Digits), (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD),
      DoubleToString(atr, _Digits), DoubleToString(atrAvg, _Digits), DoubleToString(ratio, 3),
      DoubleToString(rsi, 2), DoubleToString(rsiPrev, 2),
      DoubleToString(e9, _Digits), DoubleToString(e21, _Digits), DoubleToString(e50, _Digits), DoubleToString(e200, _Digits),
      DoubleToString(close1, _Digits), DoubleToString(close4, _Digits),
      DoubleToString(adx, 2), DoubleToString(pdi, 2), DoubleToString(mdi, 2),
      DoubleToString(macdM, 5), DoubleToString(macdS, 5), DoubleToString(macdM2, 5), DoubleToString(macdS2, 5),
      DoubleToString(bbMid, _Digits), DoubleToString(bbUp, _Digits), DoubleToString(bbLo, _Digits),
      DoubleToString(v1, 0), DoubleToString(vavg, 1),
      shi, slo,
      DoubleToString(dH, _Digits), DoubleToString(dL, _Digits), DoubleToString(pp, _Digits),
      DoubleToString(2 * pp - dL, _Digits), DoubleToString(2 * pp - dH, _Digits));
   FT_Write(line);
}

// called every 60 s (and at start): all four timeframes; the Asian range is also sent once per pass
void RadarPublish()
{
   if(!InpRadar) return;
   for(int k = 0; k < 4; k++) RadarTfLine(k);
   g_radPubLast = TimeCurrent();
}

int OnInit()
{
   // heartbeat: if this line is missing from the Experts tab, the EA did not start
   Print("[XauDesk] OnInit started, build 6.x, symbol ", _Symbol, ", magic ", InpMagic,
         ", terminal trade allowed: ", (bool)TerminalInfoInteger(TERMINAL_TRADE_ALLOWED),
         ", EA trade allowed: ", (bool)MQLInfoInteger(MQL_TRADE_ALLOWED));
   // remove the objects left by an earlier run or version: they are rebuilt below
   ObjectsDeleteAll(0, "BT_");
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpDeviation);
   trade.SetTypeFillingBySymbol(_Symbol);

   ObjectsDeleteAll(0, "BT_i_wkd");   // leftovers of an older version (balance dots)
   ComputeScale();
   Print("[XauDesk] Journal folder: Common\\Files\\XauDesk\\");
   g_px       = InpPanelX;
   g_py       = InpPanelY;
   g_ix       = (InpInfoX >= 0) ? InpInfoX : (InpCtlHorizontal ? g_px : g_px + g_ctlW + 8);
   g_iy       = (InpInfoY >= 0) ? InpInfoY : (InpCtlHorizontal ? (InpCtlAtBottom ? InpPanelY : g_py + g_ctlH + 8) : g_py);
   g_maxN     = (int)MathMax(1, MathMin(MAXN, InpMaxOrders));

   // defaults from the inputs ...
   g_riskMode = InpStartInRiskMode;
   g_pendMode = InpStartPending;
   g_tpMode   = InpStartProfitMode ? 1 : 0;
   g_lines    = true;
   g_volLot   = InpVolume;
   g_volRisk  = InpRiskPercent;
   g_n        = InpOrders;
   g_tpR      = MathMax(0.0, InpRR);
   g_tpP      = MathMax(0.0, InpProfitPercent);
   g_gridStep = (int)MathMax(1, InpGridStepPts);
   g_gridW    = InpGridWeights;
   g_basketTP = MathMax(0.0, InpBasketUSD);
   g_slMode   = InpStartSLPct ? 1 : 0;
   g_slPts    = MathMax(1.0, (double)InpDefaultSLPts);
   g_slPct    = MathMax(0.01, InpSLPercent);
   g_theme    = InpDarkTheme ? 0 : 1;

   // ... overridden by what was saved last time
   if(InpRemember) LoadSettings();
   else            GlobalVariablesDeleteAll(GVP());
   g_n = (int)MathMax(1, MathMin(g_maxN, g_n));
   LoadLayout();

   ApplyTheme(g_theme);
   ObjectsDeleteAll(0, "BT_r_");      // radar removed
   // remove level objects left by older versions (BT_lv_* and BT_lvt*)
   ObjectsDeleteAll(0, "BT_lv_");
   ObjectsDeleteAll(0, "BT_lvt");
   if(InpCorrPos != "") SymbolSelect(InpCorrPos, true);
   if(InpCorrNeg != "") SymbolSelect(InpCorrNeg, true);
   ApplyChartScheme();
   FolderCreate("XauDesk", FILE_COMMON);
   FolderCreate(FT_Dir, FILE_COMMON);
   FT_Write(FT_Meta());
   FT_BackfillStart();
   if(InpRadar && !RadarInit()) Print("FundTrack radar: an indicator handle could not be created");
   FT_Snapshot();
   FT_Positions();
   g_ftSnapAt = TimeCurrent();

   g_arsiP = InpAutoRsiPeriod; g_arsiHi = InpAutoSell; g_arsiLo = InpAutoBuy;
   g_rsi1BuyMin=InpRsi1BuyMin; g_rsi1BuyMax=InpRsi1BuyMax;
   g_rsi1SellMin=InpRsi1SellMin; g_rsi1SellMax=InpRsi1SellMax;
   g_r1TfSetting=(int)PERIOD_CURRENT;
   g_autoStep = MathMax(1, InpAutoStep); g_autoSLSell = InpAutoSLSell; g_autoSLBuy = InpAutoSLBuy;
   g_r2TfSetting=(int)InpRsi2Tf; g_r2P=InpRsi2Period;
   g_r2BuyLowMin=InpRsi2BuyLowMin; g_r2BuyLowMax=InpRsi2BuyLowMax;
   g_r2SellMin=InpRsi2SellMin; g_r2SellMax=InpRsi2SellMax;
   g_r2BuyMin=InpRsi2BuyMin; g_r2BuyMax=InpRsi2BuyMax;
   g_r2SellHighMin=InpRsi2SellHighMin; g_r2SellHighMax=InpRsi2SellHighMax;
   g_r3TfSetting=(int)InpRsi3Tf; g_r3P=InpRsi3Period;
   g_r3BuyLowMin=InpRsi3BuyLowMin; g_r3BuyLowMax=InpRsi3BuyLowMax;
   g_r3SellMin=InpRsi3SellMin; g_r3SellMax=InpRsi3SellMax;
   g_r3BuyMin=InpRsi3BuyMin; g_r3BuyMax=InpRsi3BuyMax;
   g_r3SellHighMin=InpRsi3SellHighMin; g_r3SellHighMax=InpRsi3SellHighMax;
   g_gridRsi = InpAutoRsiGrid;
   CreatePanels();
   RefreshUI();

   g_periodKey = PeriodKey();
   LoadOpenState();
   RebuildJournal();
   TrackPositions();
   SaveOpenState();

   ENUM_SYMBOL_TRADE_EXECUTION em = (ENUM_SYMBOL_TRADE_EXECUTION)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_EXEMODE);
   string exName = "Request";
   if(em == SYMBOL_TRADE_EXECUTION_MARKET)        exName = "Market";
   else if(em == SYMBOL_TRADE_EXECUTION_INSTANT)  exName = "Instant";
   else if(em == SYMBOL_TRADE_EXECUTION_EXCHANGE) exName = "Exchange";
   bool devIgnored = (em == SYMBOL_TRADE_EXECUTION_MARKET || em == SYMBOL_TRADE_EXECUTION_EXCHANGE);
   Print("[XauDesk] Execution mode: ", exName, devIgnored ? " (max deviation is ignored by the broker)" : "");

   if(AccountInfoInteger(ACCOUNT_MARGIN_MODE) == ACCOUNT_MARGIN_MODE_RETAIL_NETTING)
      SetStatus("Netting account: orders on one symbol merge into one position.");
   else if(devIgnored)
      SetStatus("Exec: " + exName + " - deviation ignored (use PENDING)");

   if(g_lines) BuildPlanLines();
   // exact levels from the inputs (usable in the Strategy Tester, where lines are hard to drag)
   if(g_lines && InpSLPrice > 0 && ObjectFind(0, O_SL) >= 0)
      ObjectSetDouble(0, O_SL, OBJPROP_PRICE, NormalizeDouble(InpSLPrice, _Digits));
   if(g_lines && g_pendMode && InpEntryPrice > 0 && ObjectFind(0, PlanEntryName(1)) >= 0)
   {
      ObjectSetDouble(0, PlanEntryName(1), OBJPROP_PRICE, NormalizeDouble(InpEntryPrice, _Digits));
      RelayoutEntries(PlanEntryName(1));
   }
   SavePlanLines();
   SetStatus("Ready");
   EventSetMillisecondTimer(1000);
   ChartSetInteger(0, CHART_EVENT_MOUSE_MOVE, true);
   ChartRedraw();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   Print("[XauDesk] OnDeinit, reason ", reason);
   EventKillTimer();
   RadarRelease();
   ChartSetInteger(0, CHART_MOUSE_SCROLL, true);
   SaveSettings();
   if(g_lines) SavePlanLines();
   SaveOpenState();
   if(InpAutoSave && ArraySize(g_trades) > 0)
      ExportJournal(false);
   ObjectsDeleteAll(0, "BT_");
   ChartRedraw();
}

// grid: split the total volume by the weights (E1 first); every level keeps at least the minimum lot
bool GridVolumes(double total, int n, double &v[], string &err)
{
   double w[];
   ArrayResize(w, n);
   string parts[];
   int c = StringSplit(g_gridW, ',', parts);
   double sum = 0;
   for(int i = 0; i < n; i++)
   {
      double x = 1.0;
      if(i < c)
      {
         string t = parts[i];
         StringTrimLeft(t);
         StringTrimRight(t);
         x = StringToDouble(t);
      }
      if(x <= 0) x = 1.0;
      w[i] = x;
      sum += x;
   }

   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   if(step <= 0) step = 0.01;
   // the largest share goes to the level nearest the stop loss, the smallest to the farthest
   double ws[];
   ArrayResize(ws, n);
   for(int i = 0; i < n; i++) ws[i] = w[i];
   for(int a = 0; a < n - 1; a++)                    // weights, largest first
      for(int b = a + 1; b < n; b++)
         if(ws[b] > ws[a]) { double t = ws[a]; ws[a] = ws[b]; ws[b] = t; }
   int ord[];
   ArrayResize(ord, n);
   for(int i = 0; i < n; i++) ord[i] = i;
   for(int a = 0; a < n - 1; a++)                    // levels, nearest to the SL first
      for(int b = a + 1; b < n; b++)
         if(MathAbs(g_plan.entry[ord[b]] - g_plan.sl) < MathAbs(g_plan.entry[ord[a]] - g_plan.sl))
         { int t = ord[a]; ord[a] = ord[b]; ord[b] = t; }
   for(int k = 0; k < n; k++) w[ord[k]] = ws[k];

   long minU  = (long)MathMax(1.0, MathCeil(vmin / step - 1e-9));
   long units = (long)MathFloor(total / step + 1e-9);

   ArrayResize(v, n);
   for(int i = 0; i < n; i++)
   {
      long u = (long)MathFloor(units * w[i] / sum + 1e-9);
      if(u < minU)
      {
         err = "Grid: volume too small for these levels";
         return false;
      }
      v[i] = NormalizeDouble(u * step, VolDigits());
   }
   return true;
}

// basket: close everything of this panel once the floating profit reaches the target
void CheckBasket()
{
   if(g_basketTP <= 0) return;
   double pl = 0;
   int cnt = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(!IsOurPosition()) continue;
      pl += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      cnt++;
   }
   if(cnt == 0) return;
   if(pl >= g_basketTP)
   {
      CloseAllPositions();
      CancelPendings();
      SetStatus(StringFormat("Basket target reached (%.2f): all closed", pl));
   }
}

// ---- tools panel (48 px wide, sections stacked, toggled from the TRADE strip): levels, MAs, fibonacci, volume profile, ZigZag ----


// MA 7 / 29 / 99 / 120 drawn by MetaTrader itself

// ZigZag (MetaTrader example indicator)

// fibonacci per timeframe on the last closed candle: from its high to its low, lines run to the current time


// volume profile per timeframe: the last closed candle split into price bins, volume from a lower timeframe


// trend icon on the chart timeframe: up / down / mixed


// one section: header (12 px) + buttons (24 px step) + gap (4 px)



// ---- AUTO: RSI signals -> market trade sized by the capital settings; one trade per activation ----
int AutoPosCount(int &dir)
{
   int n = 0;
   dir = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(PositionGetTicket(i) == 0) continue;
      if(!IsOurPosition()) continue;
      n++;
      dir = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1 : -1;
   }
   return n;
}



// locked while a trade is open (the levels of the running trade must not change)
bool AutoLocked()
{
   if(g_autoTraded) { SetStatus("AUTO: settings are locked while a trade is open"); return true; }
   return false;
}


// first signal: normal = all orders at once (EXECUTE path); RSI grid = first order, others at RSI levels





// one dial for every RSI: the arc is a gradient from sell pressure (left, red) to buy pressure (right, green).
// slot = 0,1,2 (left, right, third): each dial is redrawn at most every 400 ms.
uint g_dpT[3] = {0, 0, 0};


int g_leftBuyMinLast = -1, g_leftBuyMaxLast = -1, g_leftSellMinLast = -1, g_leftSellMaxLast = -1;

// ---- right gauge: a standalone RSI with its own timeframe and period (inputs) ----
double g_r2Last = -1;
ENUM_TIMEFRAMES g_r2Tf = PERIOD_H1;   // resolved runtime timeframe
int g_r2P = 14;                        // runtime period
int g_r2BuyLowMin, g_r2BuyLowMax, g_r2SellMin, g_r2SellMax;
int g_r2BuyMin, g_r2BuyMax, g_r2SellHighMin, g_r2SellHighMax;
int g_r2TfSetting;
int g_r3BuyLowMin, g_r3BuyLowMax, g_r3SellMin, g_r3SellMax;
int g_r3BuyMin, g_r3BuyMax, g_r3SellHighMin, g_r3SellHighMax;
int g_r3TfSetting;

// Throttle the higher-timeframe RSI calculations and canvas redraws.
// OnTick and OnTimer may both call these routines; a 1.5s cache prevents repeated
// CopyClose/Wilder calculations on every incoming tick while keeping the display responsive.
uint g_r2CalcTick = 0, g_r3CalcTick = 0;
double g_r2CachedValue = EMPTY_VALUE, g_r3CachedValue = EMPTY_VALUE;
const uint RSI_AUX_REFRESH_MS = 1500;



ENUM_TIMEFRAMES CycleRsiTf(ENUM_TIMEFRAMES cur,int delta)
{
   ENUM_TIMEFRAMES tfs[10]={PERIOD_CURRENT,PERIOD_M1,PERIOD_M5,PERIOD_M15,PERIOD_M30,PERIOD_H1,PERIOD_H4,PERIOD_D1,PERIOD_W1,PERIOD_MN1};
   int idx=0; for(int i=0;i<10;i++) if(tfs[i]==cur) idx=i;
   idx=(idx+delta+10)%10; return tfs[idx];
}


// the info dashboard (BT_i_ objects) is hidden with a timeframe mask, which keeps the objects alive
bool IsMgmtInfoObj(string nm)
{
   string mg[]={C_CARD3,C_CLOSEALL,C_CANCEL,C_BEON,C_BEOFF,C_R1,C_R2,C_R3,C_R4};
   for(int i=0;i<ArraySize(mg);i++) if(nm==mg[i]) return true;
   return StringFind(nm,"BT_i_mg")==0;
}

// the info dashboard on/off; the management block keeps its own on/off (only while a trade is open)
string g_infoHid[];   // objects that the info toggle switched off (only these are switched back on)















// every tick: width, the trade ruler and the PnL caption
void UpdateTrade()
{
   SetText(C_RRV, "1 : " + DoubleToString(g_tpR, 1));
   SetText(C_PFV, StringFormat("%+.1f%%", g_tpP));
   SetText(C_LINES, g_lines ? "LINES ON" : "LINES OFF");
   static uint lastRuler = 0;
   if(lastRuler != 0 && GetTickCount() - lastRuler < 2000) return;
   lastRuler = GetTickCount();
   DrawRRRulers();
}


// HEDGE: when the price goes back through the entry of one of our positions against its direction
// (BUY: bid below the open price; SELL: ask above it), one opposite market order of twice the volume
// is opened, once per position. The hedge carries the panel SL distance and no TP; it is marked "HEDGE".
bool  g_hedge = false;
ulong g_hedgedTk[];
input int    InpHedgeBufferPts = 50;     // HEDGE: points beyond the entry before the hedge opens
input double InpHedgeMult      = 2.0;   // HEDGE: hedge volume = this multiple of the position volume   // HEDGE: points beyond the entry the price must pass before the hedge opens

bool HedgeDone(ulong tk)
{
   for(int i = 0; i < ArraySize(g_hedgedTk); i++) if(g_hedgedTk[i] == tk) return true;
   return false;
}

// pending hedges, one per parent position: the order and the position it protects
ulong g_hgParent[];
ulong g_hgOrder[];

void HedgeForget(int h)
{
   int n = ArraySize(g_hgOrder);
   for(int i = h; i < n - 1; i++) { g_hgOrder[i] = g_hgOrder[i + 1]; g_hgParent[i] = g_hgParent[i + 1]; }
   ArrayResize(g_hgOrder, n - 1);
   ArrayResize(g_hgParent, n - 1);
}

// HEDGE: for each of our positions a pending order is placed at its trigger level (entry -/+ buffer):
// BUY position -> SELL STOP at entry - buffer; SELL position -> BUY STOP at entry + buffer.
// It fills only when the price reaches that level. If the parent closes first, the pending hedge is cancelled.
void HedgeCheck()
{
   for(int h = ArraySize(g_hgOrder) - 1; h >= 0; h--)
   {
      if(!OrderSelect(g_hgOrder[h])) { HedgeForget(h); continue; }            // filled or already gone
      if(!PositionSelectByTicket(g_hgParent[h])) { trade.OrderDelete(g_hgOrder[h]); HedgeForget(h); }
   }
   if(!g_hedge) return;

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double minD = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(!IsOurPosition()) continue;
      if(PositionGetString(POSITION_COMMENT) == "HEDGE") continue;
      if(HedgeDone(tk)) continue;
      bool   isBuy = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
      double op    = PositionGetDouble(POSITION_PRICE_OPEN);
      double vol   = PositionGetDouble(POSITION_VOLUME);
      double buf   = InpHedgeBufferPts * _Point;
      double L     = NormalizeDouble(isBuy ? op - buf : op + buf, _Digits);

      int k = ArraySize(g_hedgedTk); ArrayResize(g_hedgedTk, k + 1); g_hedgedTk[k] = tk;   // once per position
      bool valid = isBuy ? (L < bid - minD) : (L > ask + minD);
      if(!valid)
      { SetStatus(StringFormat("HEDGE not armed for #%I64u: trigger %.2f is already passed or too close", tk, L)); continue; }

      double hv = InpHedgeMult * vol;
      if(step > 0) hv = MathFloor(hv / step + 1e-9) * step;
      if(vmax > 0) hv = MathMin(hv, vmax);
      if(hv < vmin) hv = vmin;

      double d = SLDist(L);
      bool ok = isBuy
              ? trade.SellStop(hv, L, _Symbol, NormalizeDouble(L + d, _Digits), 0, ORDER_TIME_GTC, 0, "HEDGE")
              : trade.BuyStop (hv, L, _Symbol, NormalizeDouble(L - d, _Digits), 0, ORDER_TIME_GTC, 0, "HEDGE");
      if(ok)
      {
         ulong ord = trade.ResultOrder();
         int m = ArraySize(g_hgOrder);
         ArrayResize(g_hgOrder, m + 1); ArrayResize(g_hgParent, m + 1);
         g_hgOrder[m] = ord; g_hgParent[m] = tk;
         SetStatus(StringFormat("HEDGE armed: %s %.2f stop at %.2f for #%I64u", isBuy ? "SELL" : "BUY", hv, L, tk));
      }
      else SetStatus("HEDGE failed: " + trade.ResultRetcodeDescription());
   }
}

// ---- ATR gauge: volatility now against its own recent history (ratio R = ATR / SMA(ATR, base)) ----
double  g_atrLast = -1;
int     h_atrG = INVALID_HANDLE;
ENUM_TIMEFRAMES g_atrTf = PERIOD_M1;
double  g_atrVal = 0, g_atrPrev = 0, g_atrR = 0;
string  g_atrState = "";
bool    g_atrReady = false;
datetime g_atrBar = 0;
double  g_atrSma = 0, g_atrLive = 0, g_atrLiveR = 0, g_atrLastClosed = -1;







// ---- trading refresh (every second): the plan of the lines, the EXECUTE label and the mode buttons ----
// ---- plan overlay: tags on the entry / SL / TP levels and the TP lines (computed from the R:R or profit % setting) ----
void DrawPlanOverlay()
{
   BeginTags();
   if(!g_lines || !g_plan.valid || g_plan.cnt <= 0)
   {
      DeleteTPLines();
      EndTags();
      return;
   }
   double rr = (g_plan.slPts > 0) ? g_plan.tpPts / g_plan.slPts : 0;
   for(int i = 0; i < g_plan.cnt && i < MAXN; i++)
   {
      ShowTag("E" + IntegerToString(i + 1), g_plan.entry[i],
              StringFormat("E%d  %.2f lot  |  RR 1:%.2f", i + 1, g_plan.vol[i], rr), InpEntryColor);
      if(g_plan.tp[i] > 0)
      {
         double tpPts = MathAbs(g_plan.tp[i] - g_plan.entry[i]) / _Point;
         ShowTag("TP" + IntegerToString(i + 1), g_plan.tp[i],
                 StringFormat("TP %.0f pts  |  +%.2f", tpPts, OrderMoney(i, g_plan.tp[i])), InpTPColor);
         SetLine(PlanTPName(i + 1), NormalizeDouble(g_plan.tp[i], _Digits), InpTPColor, false,
                 "TP " + IntegerToString(i + 1), STYLE_DOT);
      }
      else ObjectDelete(0, PlanTPName(i + 1));
   }
   for(int i = g_plan.cnt + 1; i <= MAXN; i++) ObjectDelete(0, PlanTPName(i));
   ShowTag("SL", g_plan.sl,
           StringFormat("SL %.0f pts  |  -%.2f  (%.2f%% bal)", g_plan.slPts, g_plan.risk, g_plan.slPct), InpSLColor);
   EndTags();
}

void UpdateAll()
{
   if(g_lines) BuildPlan();                 // the preview of the order the lines describe
   DrawPlanOverlay();
   RefreshUI();
   UpdateExecuteButton();
}

// ---- management panel: shown after an entry (our positions or pending orders on this symbol) ----
int CountOurPending()
{
   int n = 0;
   for(int i = 0; i < OrdersTotal(); i++)
   {
      ulong tk = OrderGetTicket(i);
      if(tk != 0 && OrderGetString(ORDER_SYMBOL) == _Symbol) n++;
   }
   return n;
}

void CreateMgmt()
{
   if(ObjectFind(0, "BT_m_bg") < 0)  MkRect("BT_m_bg", 0, 0, 268, 190, g_card, g_border);
   if(ObjectFind(0, "BT_m_t") < 0)   MkLabel("BT_m_t", "TRADES", 0, 0, g_text, 9, "Segoe UI Semibold");
   if(ObjectFind(0, "BT_m_i") < 0)   MkLabel("BT_m_i", "", 0, 0, g_muted, 8);
   if(ObjectFind(0, C_CLOSEALL) < 0) MkButton(C_CLOSEALL, "CLOSE ALL", 0, 0, 124, 26, g_dangerBg, g_dangerFg, 8);
   if(ObjectFind(0, C_CANCEL) < 0)   MkButton(C_CANCEL, "CANCEL PENDING", 0, 0, 124, 26, g_btn, g_text, 8);
   if(ObjectFind(0, C_BEON) < 0)     MkButton(C_BEON, "BREAK-EVEN", 0, 0, 124, 26, g_btn, g_text, 8);
   if(ObjectFind(0, C_R1) < 0)       MkButton(C_R1, "", 0, 0, 60, 26, g_btn, g_text, 8);
   if(ObjectFind(0, C_R2) < 0)       MkButton(C_R2, "", 0, 0, 60, 26, g_btn, g_text, 8);
   if(ObjectFind(0, C_R3) < 0)       MkButton(C_R3, "", 0, 0, 60, 26, g_btn, g_text, 8);
   if(ObjectFind(0, C_R4) < 0)       MkButton(C_R4, "", 0, 0, 60, 26, g_btn, g_text, 8);
}

// the panel sits at the chart's top-right, always anchored to the LEFT corner so the
// position does not depend on how the terminal treats right-hand anchors
int MgmtLeft(int cw) { return MathMax(4, cw - 284); }

void MgmtPlace(string name, int x, int y, int w, int cw, bool shown, int panelX)
{
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, shown ? MgmtLeft(cw) + x : 20000);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
}

void UpdateMgmt()
{
   if(ObjectFind(0, "BT_m_bg") < 0) return;
   int np = 0; double lots = 0, pnl = 0;
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0 || !IsOurPosition()) continue;
      np++;
      lots += PositionGetDouble(POSITION_VOLUME);
      pnl  += PositionGetDouble(POSITION_PROFIT);
   }
   int nq = CountOurPending();
   long fm = 0;
   int nf = (np == 0) ? ForeignPositions(fm) : 0;
   bool shown = g_dashShown && (np > 0 || nq > 0 || nf > 0);
   int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   ObjectSetInteger(0, "BT_m_bg", OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, "BT_m_bg", OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, "BT_m_bg", OBJPROP_XDISTANCE, shown ? MgmtLeft(cw) : 20000);
   ObjectSetInteger(0, "BT_m_bg", OBJPROP_YDISTANCE, 34);
   ObjectSetInteger(0, "BT_m_bg", OBJPROP_XSIZE, 268);
   ObjectSetInteger(0, "BT_m_bg", OBJPROP_YSIZE, 190);
   MgmtPlace("BT_m_t", 10, 42, 240, cw, shown, 0);
   MgmtPlace("BT_m_i", 10, 62, 240, cw, shown, 0);
   SetText("BT_m_t", StringFormat("TRADES   %d pos  |  %d pend", np, nq));
   if(nf > 0) SetText("BT_m_i", StringFormat("open trade not ours: magic %I64d (set InpAcceptAnyMagic)", fm));
   else       SetText("BT_m_i", StringFormat("%.2f lot  |  floating %+.2f", lots, pnl));
   MgmtPlace(C_CLOSEALL, 10,  88, 124, cw, shown, 0);
   MgmtPlace(C_CANCEL,  138,  88, 124, cw, shown, 0);
   MgmtPlace(C_BEON,     10, 120, 124, cw, shown, 0);
   string rl[4] = {"-" + DoubleToString(InpReduceP1, 0) + "%", "-" + DoubleToString(InpReduceP2, 0) + "%",
                   "-" + DoubleToString(InpReduceP3, 0) + "%", "-" + DoubleToString(InpReduceP4, 0) + "%"};
   string rn[4] = {C_R1, C_R2, C_R3, C_R4};
   for(int k = 0; k < 4; k++)
   {
      SetText(rn[k], rl[k]);
      MgmtPlace(rn[k], 10 + k * 64, 152, 60, cw, shown, 0);
   }
   ChartRedraw(0);
}

void OnTimer()
{
   PollButtons();
   FT_BackfillStep();
   if(InpRadar && TimeCurrent() - g_radPubLast >= 60) RadarPublish();
   if(InpFtEvents && TimeCurrent() - g_ftSnapAt >= 60) { g_ftSnapAt = TimeCurrent(); FT_Snapshot(); FT_Positions(); }
   CheckBasket();
   uint now=GetTickCount();
   // Heavy dashboard/canvas work is timer-driven and capped at 1 Hz.
   if(g_lastUiRefreshTick==0 || (uint)(now-g_lastUiRefreshTick)>=1000)
   {
      g_lastUiRefreshTick=now;
      UpdateTrade();
      UpdateAll();
      if(ObjectFind(0, "BT_m_bg") < 0) CreateMgmt();
      UpdateMgmt();
      UpdateBEButtons();
      if(ObjectFind(0, C_ARROW) < 0) CreateArrow();
      if(!g_dashShown) SetDashVisible(false);   // objects rebuilt while hidden stay hidden
      if(InpCtlHorizontal && ((int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS) != g_ctlHcw ||
                              (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS) != g_ctlHch))
         PlaceCtlH();
      if(g_lines && ObjectFind(0, O_SL) < 0) BuildPlanLines();
      string pk=PeriodKey();
      if(pk!=g_periodKey) { g_periodKey=pk; RebuildJournal(); }
      TrackPositions();
      ChartRedraw(0);
   }
   if(g_stateDirty && GetTickCount()-g_lastStateSave>5000) SaveOpenState();
}

void OnTick()
{
   HedgeCheck();
   static uint atrLastTick = 0;
   uint atrNow = GetTickCount();
   g_tickSerial++;
   // Keep the trade engine responsive on every tick, but never rasterize canvases here.
   PollButtons();
   CheckBasket();
   TrackPositions();
}

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD && HistoryDealSelect(trans.deal)) FT_Deal(trans.deal);
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   ulong deal = trans.deal;
   if(!HistoryDealSelect(deal)) return;
   if(HistoryDealGetString(deal, DEAL_SYMBOL) != _Symbol) return;
   if(!JournalMagicOK(HistoryDealGetInteger(deal, DEAL_MAGIC))) return;
   long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
   if(entry == DEAL_ENTRY_IN)
   {
      TrackPositions();   // store the initial SL as early as possible
      SaveOpenState();
      return;
   }
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT) return;
   RebuildJournal();
   SaveOpenState();
}

// keep the entry levels STEP apart: moving one level moves the whole ladder with it
void RelayoutEntries(string dragged)
{
   int j = (int)StringToInteger(StringSubstr(dragged, StringLen(PLAN_E)));
   if(j < 1 || ObjectFind(0, dragged) < 0) return;
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl  = (ObjectFind(0, O_SL) >= 0) ? ObjectGetDouble(0, O_SL, OBJPROP_PRICE) : bid;
   double side = (sl < bid) ? -1.0 : 1.0;          // deeper levels go toward the SL
   double st   = g_gridStep * _Point;
   double p    = ObjectGetDouble(0, dragged, OBJPROP_PRICE);
   double base = p - side * (j - 1) * st;          // where level 1 must be
   for(int k = 1; k <= g_maxN; k++)
   {
      string nm = PlanEntryName(k);
      if(k > g_n || ObjectFind(0, nm) < 0) continue;
      ObjectSetDouble(0, nm, OBJPROP_PRICE, NormalizeDouble(base + side * (k - 1) * st, _Digits));
   }
}

// keyboard: S selects the SL, E selects the entries, UP / DOWN move the selected one, ESC clears.
// (MT5 has no key-up event, so "holding" is done by the selection: hold the arrow to move continuously.)
void HandleKey(int k)
{
   if(k == 'S' || k == 's') { g_keyMode = 1; SetStatus("Keys: SL selected - UP / DOWN to move, ESC to finish"); return; }
   if(k == 'E' || k == 'e') { g_keyMode = 2; SetStatus("Keys: entries selected - UP / DOWN to move, ESC to finish"); return; }
   if(k == 27)              { g_keyMode = 0; SetStatus("Keys: off"); return; }
   if(g_keyMode == 0 || !g_lines) return;

   int dir = 0;
   if(k == 38) dir = 1;          // up arrow
   else if(k == 40) dir = -1;    // down arrow
   else return;
   double d = dir * InpKeyStep * _Point;

   if(g_keyMode == 1 && ObjectFind(0, O_SL) >= 0)
      ObjectSetDouble(0, O_SL, OBJPROP_PRICE, NormalizeDouble(ObjectGetDouble(0, O_SL, OBJPROP_PRICE) + d, _Digits));
   else if(g_keyMode == 2 && ObjectFind(0, PlanEntryName(1)) >= 0)
   {
      string e1 = PlanEntryName(1);
      ObjectSetDouble(0, e1, OBJPROP_PRICE, NormalizeDouble(ObjectGetDouble(0, e1, OBJPROP_PRICE) + d, _Digits));
      RelayoutEntries(e1);     // the other levels follow, STEP apart
   }
   else
      return;
   SavePlanLines();
   ChartRedraw();
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id == CHARTEVENT_OBJECT_CLICK)
   {
      // button presses are handled once by PollButtons (state based)
   }
   else if(id == CHARTEVENT_OBJECT_ENDEDIT)
   {
      string txt = ObjectGetString(0, sparam, OBJPROP_TEXT);
      StringReplace(txt, ",", ".");
      if(sparam == C_VOL)
      {
         double v = StringToDouble(txt);
         if(v > 0) SetVol(v);
      }
      else if(sparam == C_N)
         SetN((int)StringToInteger(txt));
      else if(sparam == C_STEP)
      {
         g_gridStep = (int)MathMax(1, StringToInteger(txt));
         if(g_pendMode) RelayoutEntries(PlanEntryName(1));
      }
      else if(sparam == C_WGT)
         g_gridW = ObjectGetString(0, sparam, OBJPROP_TEXT);
      else if(sparam == C_BTP)
         g_basketTP = MathMax(0.0, StringToDouble(txt));
      else if(sparam == C_SLV)
         SetSLValue(StringToDouble(txt));
      else if(sparam == C_TP)
         SetTPValue(StringToDouble(txt));
      RefreshUI();
      SaveSettings();
      ChartRedraw();
   }
   else if(id == CHARTEVENT_MOUSE_MOVE)
   {
      HandleMouse((int)lparam, (int)dparam, ((int)StringToInteger(sparam) & 1) != 0);
   }
   else if(id == CHARTEVENT_KEYDOWN)
      HandleKey((int)lparam);
   else if(id == CHARTEVENT_OBJECT_DRAG)
   {
      if(StringFind(sparam, PLAN_E) == 0) RelayoutEntries(sparam);
      if(sparam == O_SL || StringFind(sparam, PLAN_E) == 0)
      {
         SavePlanLines();
         ChartRedraw();
      }
   }
}
//+------------------------------------------------------------------+