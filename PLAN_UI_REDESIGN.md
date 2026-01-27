# UI Redesign Plan

Based on the attached screenshots, this plan outlines all changes needed to match the new design.

---

## Overview of New Design Elements

### Screenshot Analysis

**Screenshot 1 - Crypto Overview (with perps/derivatives):**
- Header: "CRYPTO" label, hidden balance (dots), stats on right (ASSETS, DEBTS, POSITIONS: 277)
- 3 donut charts in a row: Custody, Exposure, By Chain
- "Spot vs Derivatives" section with two cards
- "Crypto Metrics" section with 4 metric cards

**Screenshot 2 - Intelligence Page (All tab):**
- New "Intelligence" page in sidebar under "All"
- Shows "Daily Review" with Generate button
- Shows "Chat with AI" section with quick question tags
- Connected to Ollama locally

**Screenshot 3 - Crypto Overview (simpler, no perps):**
- Same 3 donut charts layout
- "Crypto Metrics" section
- "Crypto Allocation" horizontal bar chart with Details link

**Screenshot 4 & 5 - Crypto Overview (with perps):**
- Same structure as Screenshot 1
- Shows Spot Holdings (Long/Short/Net) and Derivatives (Long/Collateral/Net Exposure)
- Net Spot Value and Net Derivatives Exposure summary rows

---

## Detailed Changes Required

### 1. CategoryView Component Redesign (`/src/components/CategoryView.tsx`)

**Current:** Single donut chart, allocation breakdown with progress bars, positions table
**New:** 3 donut charts side-by-side, Spot vs Derivatives section, Metrics cards, Allocation bars

#### A. Header Section
- Keep: Category label, total value (hidden with dots), description
- Change: Stats moved to top-right corner, formatted as "ASSETS", "DEBTS", "POSITIONS" in smaller text

#### B. New 3-Column Donut Chart Section
Create 3 side-by-side charts:
1. **Custody** - Self-Custody, DeFi, CEX, Manual
2. **Exposure** - Stablecoins, ETH, DeFi, BTC, RWA, SOL, Privacy, Other
3. **By Chain** - Ethereum, Lighter, Binance, Other, Sol (+ "X more chains" link)

Each chart shows:
- Donut visualization
- Legend on the right with colored squares and percentages

#### C. Spot vs Derivatives Section (Only show if derivatives exist)
Two cards side-by-side:
- **Spot Holdings** card:
  - "On-chain" tag in top-right
  - Long row with arrow icon
  - Short row with arrow icon (if applicable)
  - Net Spot row (bold)

- **Derivatives** card:
  - "Perps" tag in top-right
  - Long row with arrow icon
  - Collateral row with gray square icon
  - Net Exposure row (bold)

Below cards:
- **Net Spot Value** row spanning full width
- **Net Derivatives Exposure** row spanning full width

#### D. Crypto Metrics Section
4 metric cards in a row:
1. **STABLECOIN RATIO** - e.g., "30.0%"
2. **BTC DOMINANCE** - e.g., "15.5%" with orange square
3. **ETH DOMINANCE** - e.g., "21.1%" with blue square
4. **DEFI EXPOSURE** - e.g., "40.0%" with purple square

#### E. Crypto Allocation Section
- Title: "Crypto Allocation" with "Details" link on right
- Horizontal bar chart showing: BTC, ETH, SOL, Stablecoins, Tokens
- Each row: colored square, name, progress bar, percentage, hidden value (dots)

### 2. Sidebar Updates (`/src/components/AppShell.tsx`)

#### A. Add "Assets" to sidebar
Change sidebar items:
- Overview → Overview
- Positions → **Assets** (rename)
- Exposure → Exposure
- Performance → Performance

#### B. Update crypto sidebar
- Overview
- **Assets** (was Positions)
- Exposure
- Perps
- Wallets
- Accounts

### 3. Donut Chart Component (`/src/components/charts/DonutChart.tsx`)

Create a new reusable donut chart component:
- Props: data (array of {label, value, color}), title, size
- Shows donut with hole in center
- Legend on right side with colored squares and percentages
- Optional: "+X more" link for long lists

### 4. CSS/Styling Updates (`/src/app/globals.css`)

- Ensure consistent card styling
- Add styles for the new donut chart legends
- Add styles for metric cards with colored indicators

---

## Files to Create/Modify

### Create New Files:
1. `/src/components/charts/DonutChart.tsx` - Reusable donut chart with legend

### Modify Existing Files:
1. `/src/components/CategoryView.tsx` - Major redesign
2. `/src/components/AppShell.tsx` - Sidebar item rename (Positions → Assets)
3. `/src/app/crypto/page.tsx` - Use new component structure
4. `/src/services/domain/portfolio-calculator.ts` - Add custody/chain breakdown calculations

---

## Implementation Order

1. **Phase 1: Donut Chart Component**
   - Create DonutChart.tsx with legend support
   - Test with sample data

2. **Phase 2: CategoryView Redesign**
   - Add 3-column donut chart section
   - Add Spot vs Derivatives section
   - Add Metrics cards section
   - Update Allocation section

3. **Phase 3: Data Calculations**
   - Add custody breakdown calculation (Self-Custody, DeFi, CEX, Manual)
   - Add chain breakdown calculation
   - Add metrics calculations (stablecoin ratio, BTC dominance, etc.)

4. **Phase 4: Sidebar Updates**
   - Rename "Positions" to "Assets"
   - Add Intelligence page to sidebar (All tab only)

5. **Phase 5: Intelligence Page**
   - Create basic page structure
   - Add Ollama connection indicator
   - Add Daily Review section (UI only initially)
   - Add Chat section (UI only initially)

---

## Notes

- All values should respect `hideBalances` toggle (show as "••••")
- Donut charts should show percentages with tilde prefix (~) for approximation
- The "Spot vs Derivatives" section only appears when user has perp positions
- Chain breakdown should group small chains into "Other" and show "+X more chains"
