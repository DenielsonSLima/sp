---
name: retail-supermarket-ops
description: |-
  Operational and analytical guidance for running a supermarket / grocery / FMCG retail business in India — assortment, pricing & margins, inventory & replenishment, shrinkage, store KPIs, supplier/GST terms, promotions, and category management. Includes formulas and India-specific compliance (GST, FSSAI, Legal Metrology, BIS).
  TRIGGER when the user works on a supermarket, kirana/grocery, D-Mart-style retail, or FMCG store and asks about: stock/inventory levels, reorder points, margins/markup, GMROI, shrinkage, planograms, category mix, promotions/discounts, vendor terms, store P&L, or retail KPIs; or wants spreadsheets/reports/dashboards for retail operations.
  Jurisdiction: India. For the spreadsheet/report deliverable itself, pair with the xlsx/docx skills.
---

# Retail & Supermarket Operations (India)

Use this to reason about grocery/FMCG retail like an experienced category and store-operations manager. Retail margins are thin (often 3–8% net), so small improvements in shrinkage, margin mix, and inventory turns move profit a lot. Always ground advice in the store's actual numbers — ask for them rather than assuming.

## Core economics & formulas

- **Gross margin %** = (Selling price − Cost) / Selling price. (Note: *markup* is on cost, *margin* is on selling price — don't confuse them.)
- **Markup %** = (Selling price − Cost) / Cost.
- **GMROI** (Gross Margin Return on Inventory Investment) = Gross margin ₹ / Average inventory cost. The single best health metric for a category; target > 1, ideally > 3 for fast grocery.
- **Inventory turns** = COGS / Average inventory (at cost). Grocery staples turn fast (12–26×/yr); slow-movers tie up cash.
- **Days of inventory** = 365 / turns.
- **Sell-through %** = Units sold / Units received, over a period.
- **Shrinkage %** = (Book stock − Physical stock value) / Sales. Keep < 2%; sources: theft, spoilage, damage, billing errors, weighing fraud.
- **Sales per sq ft** and **basket size (ATV)** and **items per basket** — core store productivity KPIs.
- **GMROL/labour productivity** = Gross margin / labour hours.

## Inventory & replenishment

- **Reorder point (ROP)** = (Average daily demand × Lead time in days) + Safety stock.
- **Safety stock** ≈ Z × σ_demand × √lead time (Z≈1.65 for ~95% service level). Higher for perishables with volatile demand? No — for perishables prefer *lower* safety stock + more frequent ordering to limit spoilage.
- **Economic Order Quantity (EOQ)** = √(2 × annual demand × order cost / holding cost) — a starting point, adjust for supplier MOQ, slab discounts, and shelf life.
- Segment SKUs with **ABC** (by sales value) × **FSN** (Fast/Slow/Non-moving) and **XYZ** (demand variability). Tighten control on A-X items; cull N (non-moving) items.
- **Perishables (FEFO):** rotate First-Expiry-First-Out, mark down before expiry, track waste % by category, and right-size order frequency to shelf life.

## Assortment & category management

- Build a **category role** for each category: destination, routine, convenience, seasonal. Allocate space and promo intensity accordingly.
- Optimize **planograms** by GMROI and units-per-slot, not gut feel; eye-level shelves for high-margin/impulse, staples lower.
- Manage **private label** to lift margin (typically 8–15 pts higher) without alienating brand-loyal shoppers.
- Prune the **long tail**: SKUs in the bottom decile of sales that aren't strategic drain working capital and shelf space.

## Pricing & promotions

- Use **price zones / KVIs** (Known Value Items — milk, oil, atta, eggs): price these competitively to drive footfall, recover margin on the rest.
- Promotions: model **incremental** units, not total — a discount that only subsidizes existing buyers destroys margin. Track promo lift, cannibalization, and forward-buying.
- Watch **net margin after trade spend**: supplier slotting/visibility/listing fees and scheme payouts materially change true category profit.

## Supplier & GST terms

- Negotiate on **landed cost**: base price − trade discount − scheme − cash discount, plus freight and GST treatment; compare suppliers on landed cost, not list price.
- **Credit period** (days payable) funds working capital — longer terms on slow stock, faster pay for cash discounts when the discount APR beats your cost of capital.
- **GST input credit:** purchases carry input GST; ensure supplier invoices are GST-compliant and reflected in GSTR-2B so input tax credit (ITC) isn't lost. Reconcile ITC monthly.

## India compliance essentials

- **GST:** Most packaged/branded foods attract GST (commonly 5%/12%/18%; many unbranded staples are exempt/0%). File GSTR-1 and GSTR-3B; reconcile ITC against GSTR-2B. Maintain HSN codes per SKU.
- **FSSAI:** Food business licence/registration required; display licence number; comply with labelling, storage temperature, and hygiene norms.
- **Legal Metrology (Packaged Commodities Rules):** pre-packaged goods must show MRP (inclusive of all taxes), net quantity, mfg/expiry, importer/packer details. Weighing scales must be stamped/verified.
- **BIS / standards** for relevant products; **Shops & Establishments Act** registration (state-specific) for the store and labour norms.

## Store KPIs dashboard (what to track weekly)

Sales vs target, gross margin %, GMROI by category, inventory turns & days-on-hand, shrinkage %, waste % (perishables), out-of-stock % on A-items, basket size (ATV), conversion/footfall, and labour cost % of sales.

## When building deliverables

- For inventory/margin/replenishment models, build an **xlsx** with clearly separated inputs, calculations, and outputs; show formulas, not just numbers.
- For store P&L or category reviews, structure as: summary KPIs → drivers → actions.
- Always state assumptions (demand, lead time, service level) and let the user override them.
