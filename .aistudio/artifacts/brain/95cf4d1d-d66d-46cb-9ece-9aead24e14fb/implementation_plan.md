# FundTrack Intelligence & Automation Upgrade Plan

This upgrade transforms FundTrack from a reactive tracking dashboard into a proactive decision-support cockpit by closing three critical product gaps: behavioral trading risk guardrails, forward-looking 30-day cashflow & debt payoff simulation, and instant cross-panel navigation with printable periodic scorecards.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Because the interview questions were skipped, this plan locks in the recommended defaults across all three tracks. Request revisions if you prefer a different storage backend or narrower scope before execution.

- **Confirmed Default 1 — Full Intelligence Suite**: Add the Trading Psychology & Setup Matrix, Pre-Trade Lot-Size Calculator, Daily Drawdown Circuit Breaker, Click-to-Filter Journal links, CSV/MT5 Trade Importer, 30-Day Cashflow Runway Chart, Interactive Debt "What-If" Simulator, Global `Ctrl+K` Command Palette, and Weekly/Monthly Digest Report.
- **Confirmed Default 2 — Risk & Behavior First**: Prioritize real behavioral leak detection (`Emotion × Setup` PnL breakdown) and live pre-trade position sizing linked directly to the user's MT5 equity and daily loss cap.
- **Confirmed Default 3 — Local-First Persistence**: Retain zero-friction browser storage (`localStorage`) paired with instant JSON snapshot export/restore, avoiding mandatory login walls or server database setup.

---

## 1. Overview & Core Concept

- **What It Does**: Connects raw trading logs, psychological tags, and personal finance obligations into active guardrails and forward simulations. Instead of merely displaying past numbers, the cockpit answers *"How much lot size can I safely take right now?"*, *"Which emotion or setup is quietly draining my account?"*, *"Will my bank balance cover upcoming installments over the next 30 days?"*, and *"How fast can I clear all debt?"*
- **Target Audience / Persona**: Active FX/gold/crypto traders managing both MT5 trading accounts and personal cashflow, loans, people ledgers, and priority-weighted life goals in bilingual Persian (RTL) and English (LTR).
- **Key Value**: Prevents destructive FOMO/revenge overtrading, eliminates cashflow surprises before loan/bill due dates, accelerates Debt-First freedom with concrete simulation math, and unifies search across every entity via `Ctrl+K`.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Pre-Trade Safety Flow**: Inside Trading -> Risk & Calculator or Quick Action, user picks an MT5 account, entry price, stop loss, take profit, and risk percentage -> sees calculated lot size, dollar risk, R:R ratio, and whether today's cumulative drawdown already triggered the daily circuit breaker.
  2. **Diagnostic Drill-Down Flow**: User inspects the Emotion × Setup Matrix or the `24h × 7d` Win-Rate Density Heatmap in Trading Analytics -> clicks a red/high-variance segment (e.g., *Revenge* or *London 14:00*) -> automatically switches to the Trade Journal filtered to those exact trades with a clearable filter chip bar.
  3. **Broker Import Flow**: User drops a standard broker CSV / MT5 history export -> sees a live mapped preview table (ticket, symbol, side, volume, profit, timestamps) -> confirms import with duplicate-ticket protection.
  4. **30-Day Cashflow & What-If Flow**: Inside Finance Planning, user views a day-by-day projected balance line across the next 30 days flagging upcoming installment/bill collisions -> drags the *Extra Monthly Debt Allocation* slider to watch projected debt-free date and Goal unlock timeline update in real time.
  5. **Global Command Palette (`Ctrl+K` / `Cmd+K`)**: Pressing `Ctrl+K` (or clicking the subtle header/sidebar search affordance) opens a frosted glass modal to jump directly to any trade, person ledger, loan, goal, or quick action.
  6. **Periodic Digest & Print Report**: Inside Overview or Actions, user switches between *Weekly* and *Monthly* Executive Digest cards summarizing net trading PnL, SL discipline, debt reduced, savings rate, and top/worst habits, with a clean *Print / Save PDF* mode.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Continues FundTrack's Layered Translucent Material-Glass cockpit across all 10 light and dark themes (`Obsidian`, `Aurora`, `Midnight`, `Emerald`, `Crimson`, `Cyberpunk`, `Royal`, `Light`, `Coral`, `Lavender`).
  - *Color Palette & Mood*: Preserves the 60-30-10 discipline — neutral theme canvas (`--ft-canvas`), frosted structural cards (`.glass-surface` / `.glass-tile` / `.glass-dropdown`), and high-intent theme gradient accents (`--ft-accent-grad`), pairing semantic status colors (`--ft-positive`, `--ft-warning`, `--ft-danger`) strictly with explicit labels/icons (never hue-only).
  - *Typography & Hierarchy*: `Vazirmatn` + `Plus Jakarta Sans` for crisp bilingual display/body prose; `JetBrains Mono` (`tabular-nums`) for all prices, lot sizes, PnL, dates, and ratios to guarantee zero vertical jitter.
  - *Component Styling & Layout*: Single-elevation glass cards (`rounded-3xl`), hairline dividers (`--ft-border`), interactive segmented filter buttons (no static decorative pills, no pulsing dots, no thick left accent bars).
- **Interactive Feedback & Motion**: Smooth `cubic-bezier(0.16, 1, 0.3, 1)` transitions under 200ms (`transform` / `opacity` only), respecting `prefers-reduced-motion`; empty, populated, and validation error states on every new calculator, importer, and timeline chart.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Client-Side Risk & Cashflow Engine vs. Backend Microservice**
  - *Chosen Approach*: Pure deterministic calculation helpers for position sizing, daily drawdown checks, 30-day cashflow projection, and debt payoff simulation.
  - *Why*: Instant zero-latency slider and calculator feedback without network roundtrips or persistence drift.
  - *Alternatives Considered*: Server-side simulation endpoints — rejected because all state already lives locally and instant scrubbing at 60fps improves UX.
- **Decision 2 — Cross-View Click-to-Filter State vs. Isolated Sub-Tab Filters**
  - *Chosen Approach*: Lift an optional structured Trade Journal filter payload (`emotion`, `setup`, `weekday`, `hour`, `durationBucket`) to the Trading workspace level so clicking any analytics visualization opens and filters the journal immediately.
  - *Why*: Turns passive charts into investigative tools, fulfilling the "data-to-action" loop.
  - *Alternatives Considered*: Showing mini-popups inside charts — rejected due to mobile crowding and inability to open full trade review drawers from popups.
- **Decision 3 — Unified `Ctrl+K` Modal vs. Persistent Header Search Input**
  - *Chosen Approach*: Keyboard-triggered `Ctrl+K` / `Cmd+K` frosted glass Command Palette modal plus a compact icon trigger, keeping the 3-zone top header contract clean and uncluttered.
  - *Why*: Preserves strict top-bar visual restraint while indexing trades, people, debts, goals, and commands in one place.
  - *Alternatives Considered*: Expanding the header with a wide input box — rejected because it breaks header zone proportions on 1024px–1280px viewports.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         FundTrack Persistent State                           │
│   Trades · MT5 Accounts · Bank Accounts · Loans · Fixed Expenses · Goals     │
│   Settings (dailyMaxLossPct, defaultRiskPct, usdToman, Theme, Language)      │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│ Risk & Psychology │   │ Cashflow & Debt   │   │ Global Palette &  │
│  Compute Engine   │   │ Simulation Engine │   │  Digest Engine    │
│                   │   │                   │   │                   │
│ - Emotion × Setup │   │ - 30d Daily Balance   │ - Fuzzy Search    │
│ - Lot Size & R:R  │   │   Runway & Alerts │   │   Across Entities │
│ - Daily DD Check  │   │ - Extra Payment   │   │ - Weekly/Monthly  │
│ - CSV/MT5 Parser  │   │   Months-Saved    │   │   Scorecard       │
└─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘
          │                       │                       │
          ▼                       ▼                       ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│   Trading View    │   │   Finance View    │   │ Overview & Global │
│                   │   │                   │   │      Shell        │
│ - Psych Matrix    │   │ - 30d Runway SVG  │   │ - Ctrl+K Palette  │
│ - Risk Calculator │   │ - What-If Slider  │   │ - Digest View +   │
│ - Click-to-Filter │   │ - Collision Flags │   │   Print Mode      │
│ - CSV Import Drop │   │                   │   │ - DD Alert Sync   │
└───────────────────┘   └───────────────────┘   └───────────────────┘
```

- **Data Model & State**:
  - Extend `SystemSettings` with `dailyMaxLossPct` (default `3%`), `defaultRiskPct` (default `1%`), and optional `monthlyExpectedIncomeIrt` for 30-day runway baselines.
  - Add derived view models (not persisted raw) for `EmotionSetupStats`, `PositionSizingResult`, `CashflowDayPoint`, `DebtWhatIfComparison`, and `PeriodDigestReport`.
  - Daily drawdown alerts automatically emit/update persistent `NotificationItem` records when realized today's loss exceeds `dailyMaxLossPct` of active MT5 equity.
- **Interactive Component & State Mapping**:
  - **Command Palette Modal**: Bound globally to `keydown` (`Ctrl+K` / `Cmd+K` and `Escape`), filtering across trades, bank accounts, people, loans, goals, and quick navigation/action commands; selecting a row navigates to the target category/sub-tab or triggers the action and closes cleanly.
  - **Trading Risk & Psychology Controls**:
    - Clicking any bar/cell in `Emotion × Setup` Matrix, `TradeWinRateDensityHeatmap`, or `DurationBucketsChart` dispatches a structured filter object to `TradingView` and switches to the `journal` sub-tab with a dismissible filter indicator.
    - Lot-size calculator binds account selector, symbol preset (`XAUUSD`, `EURUSD`, `GBPUSD`, `USDJPY`, `BTCUSD`, `Custom`), balance override, risk %, entry, SL, and TP to live validation (`entry !== sl`) and outputs exact lots, risked USD/IRT, projected profit, and R:R gauge.
    - CSV importer reads uploaded `.csv` / `.txt` files, maps detected headers (`ticket`, `symbol`, `type/direction`, `volume/lots`, `open`, `close`, `profit`, `commission`, `swap`), previews valid vs duplicate rows, and merges only new trades into state.
  - **Finance Runway & What-If Controls**:
    - 30-day runway engine projects daily running liquid balance from today across the next 30 calendar days, subtracting scheduled `FixedExpense` items on matching Jalali days and open `LoanItem` installments on matching due dates, marking collision days (`balance < 0`) cleanly on an interactive SVG timeline with hover tooltips.
    - Debt What-If slider dynamically re-runs the Debt-First Avalanche/Snowball payoff simulation with the user's extra monthly IRT allocation and displays current vs accelerated payoff date, months saved, and Goal unlock date.
  - **Executive Digest & Print View**:
    - Segmented toggle (`Weekly` / `Monthly`) calculates period deltas from `trades`, `transactions`, `loans`, and `goals`; clicking *Print Report* triggers a dedicated print stylesheet hiding sidebar/chrome so the glass scorecard exports cleanly to PDF/paper.
