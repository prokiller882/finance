# Reconciliation: brief → PRD

- **Inputs:** `briefs/brief-test-app-2026-11-22/brief.md` (final, 2026-11-22) + `addendum.md`
- **PRD:** `prds/prd-test-app-2026-11-22/prd.md` (draft, 2026-11-22)
- **Method:** line-by-line claim diff, then a departure audit (every PRD decision that reverses or extends a brief decision must be justified in place, in §9 or in §10).
- **Verdict:** 5 material gaps. Structure is largely faithful; the losses are concentrated in *why* (pain story, differentiation) and in *unflagged scope additions* (savings norm).

---

## 1. Qualitative intent — 1 gap

### G-1. The origin incident and the credit-failure loop are gone; the "corporate accounting for private life" metaphor is diluted

**Brief:** §«Проблема: деньги кончаются раньше дохода», lines 18–22 — «Средства закончились **за 7 дней до аванса**. На продукты не хватило, пришлось брать небольшой заём»; second half: «Люди тратят всё, а на ежемесячный платёж денег уже нет: начинается просрочка, новый заём, кассовый разрыв. Обязательство живёт отдельно от повседневных трат, и именно на этом стыке ломается планирование».
Also line 14: «три контура корпоративного учёта, перенесённых на частную жизнь».

**PRD:** no «Проблема» section at all — §1 Видение (16–22) runs straight into §2 JTBD (26–32). UJ-3 (49–50) dramatizes the end-of-cycle squeeze but as a scenario, not as cause. §1 line 20 rewords the metaphor to «собранных из лучших практик финансового учёта», dropping «перенесённых на частную жизнь».

**Why it matters:** the incident is the reason the product exists; the credit loop is the reason §7.1 puts обязательства first and the reason SM-1/SM-2 are the success test. Without it, §7.1 reads as an arbitrary ordering and SM-1/SM-2 as arbitrary metrics. «Перенесённые из корпоративного учёта» is the intellectual frame that justifies having P&L, ДДС and баланс in a phone app; «лучшие практики» is generic.

**Change:** add a short «Проблема» subsection between §1 and §2 (5–8 lines) carrying the 7-days-before-advance incident, the credit loop, and the «обязательство живёт отдельно от повседневных трат» diagnosis; restore the metaphor in §1 line 20; link SM-1/SM-2 to it.

---

## 2. Concrete commitments — 1 gap (the rest are intact)

### G-2. The three-month priority is restated as a list but its rationale and its original contents are altered

**Brief:** line 74 — «Ближайшие три месяца уходят на обязательства: **именно на кредитах люди ошибаются чаще всего**», followed by a closed 4-item list (76–79) and an explicit «Следующий шаг — бюджеты и аналитика» (83).

**PRD:** §7.1 (603–611) has five bullets — обязательства, платёж в календаре, дневной лимит, **норма сбережений и счета накоплений**, обзор. The «почему обязательства первыми» sentence is absent. The savings-norm bullet has no brief antecedent (see G-3).

**Why it matters:** the brief's ordering was an argument, not a list; the PRD keeps the order and discards the argument, so the next reader cannot tell whether обязательства-first is still deliberate or merely inherited.

**Change:** restore the one-line rationale at the head of §7.1 and mark the savings bullet as an addition (G-3).

### No material gaps in the rest of this area

- **Acceptance criterion** — brief line 81 «баланс и дневной лимит видны сразу, без перехода по экранам» is carried verbatim at PRD line 611 and operationalized by FR-31 (392–393) and FR-43 (511–515). Intact.
- **«Не входит в первую версию»** — all eight items (brief line 85) map to §6 Non-Goals: кредитные карты/рассрочки/долги частным лицам (591), вклады и проценты (592), учёт чужих средств (593), расчёт платежа внутри приложения (594), синхронизация (596), уведомления (597), монетизация (598). PRD adds «Досрочное погашение и плавающая ставка» (595) — in the brief this was open question 4, not a non-goal; promoting it to a non-goal while also keeping it as open question 4 (§9.4) is slightly inconsistent but harmless. PRD also adds «Автоматические тесты в репозитории» (599) — a repo fact, not a product boundary; acceptable, worth a word in §6 so it does not read as a product decision.
- **Success criteria** — brief line 70 («за квартал … не берёт ни одного займа до зарплаты и не пропускает ни одного обязательного платежа») is split correctly into SM-1/SM-2 (629–630) and strengthened, not weakened. SM-3, SM-4 and SM-C1…C3 are net additions; SM-C3 (641) preserves the brief's «Приложение не морализирует — оно показывает» (line 48). Intact.
- **Scope mechanics of budgets** — brief line 46 (budgets ≤ free money, budgets do not shrink the daily limit, budgets live on a separate screen) → FR-32/33/35/36. Intact.
- **Main-screen contract** — brief line 54 («Ближайшие платежи» переезжают в календарь; «Всего на счетах» + раскрывающийся список + лимит + краткий журнал) → FR-42/43/45, including the explicit negative «Ближайшие платежи» на обзоре отсутствуют» (531). Intact.

---

## 3. Deliberate departures — 3 gaps

### G-3. Savings norm + savings accounts enter the three-month MVP with no departure note

**Brief:** no savings accounts, no savings norm, no automatic transfers anywhere. The nearest statement is a 2–3 year horizon: «Куда это идёт», line 97 — «человек чётко знает, сколько можно потратить **и сколько можно отложить**».
**Addendum:** no support either — the only related note is that Monzo/Simple/PocketGuard subtract pots/goals from the daily figure (lines 17, 18, 21), i.e. the brief's rule 1 (line 34: «ожидаемый доход не входит, пока не пришёл») was written *without* savings.

**PRD:** §4.5 FR-22…FR-26 (287–336), glossary «Счёт накоплений» / «Норма сбережений» (58–59), UJ-2 (46–47), SM-4 and SM-C2 (635, 640), and the MVP bullet «Норма сбережений и счета накоплений с процентами» (608). §1 line 22 adds «норма сбережений резервируется первой» and «накопления физически уезжают на отдельные счета».
Only the *storage location* of the percent is flagged — §10 line 658 (FR-2: percent on the account, replacing «более раннюю идею одного целевого счёта в настройках»). That earlier idea is not in the brief either.

**Why it matters:** this is the single largest scope addition in the PRD. It changes the daily-limit base (a share of every income is removed before the limit is computed), the overview structure (three sums, FR-3), the operation model (auto-created transfers, FR-23/25) and the success metrics (SM-4). None of that is traceable to the brief, and none of it is labelled as new. A reader comparing brief and PRD will conclude the norm was always planned.

**Change:** add a §10 entry (and a one-line note in §7.1) stating that savings accounts and the norm are new since the brief, why they precede обязательства in priority, and that FR-3's three sums follow from them; or move the norm to §7.2 if the three-month promise is meant to stay обязательства-only.

### G-4. Forbidding manual debt correction contradicts the brief and the reversal's reason is not recorded

**Brief:** line 42 — «**Остаток можно править руками в любой момент** — цифра банка важнее расчётной». Also listed as first-version scope: line 76 «форма, хранение, остаток, **ручная коррекция**».

**PRD:** FR-20 «Запрет ручной коррекции остатка» (269–276) inverts it: field available only at creation, remainder changes only via paid occurrences, `[ASSUMPTION]` pointing at open question 3.

**Assessment:** the *reversal is flagged* (FR-20 assumption, §9.3, §10 line 654) — so this is not a silent drop. Two things are still missing:
1. The PRD never says it is contradicting the brief. §9.3 reads as an internal design question, not as a reversal of a stated brief principle, so the trade-off is invisible to whoever reads only §9.
2. The *reason* for forbidding is nowhere. The brief's reason is explicit («цифра банка важнее расчётной»); the PRD's counter-reason (auditability of the balance sheet? avoiding drift between debt and P&L?) is unstated, so the reversal cannot be defended — and FR-20 currently leaves the product with no correction path at all, which the brief's principle existed to prevent.

**Change:** in FR-20, name the brief line being reversed and give the reason; in §9.3 note that a no-correction path is a regression against the brief's «цифра банка важнее расчётной» until a replacement mechanism is chosen.

### G-5. The differentiation claim is reversed, the brief's first open question is dropped, and monetization is closed off

**Brief:** §«Чем это отличается» (56–62) — «**Пока ничем, кроме точности под одного человека**»; «Дневной лимит — индустриальный стандарт … формула везде одна»; «Ответ на вопрос „почему не Дзен-мани“ пока не найден; это открытый вопрос». §«Кратко о продукте» line 16: «Коммерческие планы есть, но честно: рынок не проверен, модели монетизации нет». Open question 1 (89): «**Отличие от конкурентов.** От него зависит коммерческое будущее».
**Addendum:** line 11 — «Формула дневного лимита одинакова у всех … **Сама механика — не отличие**»; line 13/34 — the only defensible differentiation is a narrow segment («CFO для себя», фрилансеры).

**PRD:** §1 line 22 — «**Отличие от трекеров расходов не в отчётности, а в производной цифре**». §9 (643–650) lists six open questions and contains no differentiation question. §6 line 598 — «Монетизация» as a non-goal, i.e. closed rather than unproven.

**Why it matters:** this is the one place where the PRD states the opposite of the brief and of its own research, and then removes the question from the register. §0 line 14 delegates the commercial hypothesis to the brief, which would be a legitimate choice — except §1 then answers the delegated question with a claim the brief rejects. Either the PRD owns the positioning or it does not.

**Change:** either (a) soften §1 to match the brief — «механика дневного лимита — стандарт; отличие пока не найдено» — and keep monetization as «не решено» rather than a non-goal; or (b) keep the claim but add it to §9 as an explicit disagreement with the brief and cite the addendum's evidence against it.

---

## 4. Market / positioning material from the addendum — 1 gap (intent correct, attribution wrong)

### G-6. The addendum is excluded in principle but never named, and is attributed to the brief

**PRD:** §0 line 14 — «Опирается на `brief.md` (final, 2026-11-22) и не повторяет его маркетинговую часть: **ландшафт конкурентов** и коммерческая гипотеза остаются в брифе».

**Addendum:** the landscape is not in the brief — it is in `addendum.md` (competitor table lines 15–34, formula conclusion line 11, sources 36–44). The brief's own §«Чем это отличается» is a three-paragraph summary without sources.

**Assessment:** the *decision* is right — the PRD correctly keeps the landscape, the vendor-sourced review and the «CFO для себя» segment out of the feature set, and no competitor material leaks into §4. What is wrong is the provenance: the PRD cites only `brief.md`, so the addendum's caveats («источник вендорский, не нейтральный»; «наблюдения … отдельными источниками не проверялись», lines 42, 44) are silently dropped along with the file. If anyone later reuses the landscape for marketing, the PRD gives them no pointer to those caveats.

**Change:** in §0, say «в брифе и `addendum.md`», add `addendum.md` to the sources, and record in §2.2 or §6 that the addendum's «CFO для себя / фрилансеры» segment is deliberately not adopted as a v1 user segment (the brief's user is an advance-plus-salary earner, line 66).

---

## 5. Items checked and found intact (no action)

- Three contours, обязательство as a mandatory outflow inside the same limit calculation (brief 40 → PRD 220).
- Daily-limit rules 1–3 (brief 34–36) → FR-27/FR-28. Note: FR-27 bounds rule 3 at «месяц от сегодня», which the brief left unbounded; this is flagged in §10 line 659, so it counts as declared — but the bound makes the limit more optimistic than the brief's rule, and the reason for one month is not given. Worth a sentence, not a gap.
- Brief's worked example (12 000 / 7 000 / 15 000 / 263 ₽) is reproduced as a testable case in FR-27 (360) — good.
- «Приложение не морализирует» (48) → SM-C3 (641).
- P&L / ДДС / баланс separation of the payment (brief 42 → FR-18), including the «оценка» caveat — the caveat survives only as open question 1 (645); acceptable since the accuracy limit is acknowledged.
- Budgets as ceilings that do not shrink the limit (brief 46 → FR-32/36). FR-34's auto-cut-and-restore is new behaviour the brief did not specify; it is flagged in §10 (660) as a rule gap, though the choice of auto-cut over warn-and-freeze is not argued and quietly overrides user-set ceilings — a follow-up question rather than a gap.

## 6. Summary of changes requested

| # | Where | Change |
|---|---|---|
| G-1 | PRD §1–§2 | add «Проблема» with the 7-days incident and credit loop; restore «перенесённых на частную жизнь» |
| G-2 | PRD §7.1 | restore the «обязательства первыми, потому что на кредитах ошибаются чаще» rationale |
| G-3 | PRD §4.5, §7.1, §10 | mark savings accounts + norm as a post-brief addition (or defer to §7.2) |
| G-4 | PRD FR-20, §9.3 | name the reversed brief principle and record the reason for forbidding correction |
| G-5 | PRD §1, §6, §9 | reconcile the «производная цифра — отличие» claim with brief 56–62 / addendum 11; keep differentiation as an open question |
| G-6 | PRD §0, sources | cite `addendum.md`, carry its source caveats, state that the «CFO для себя» segment is not adopted |
