# QA Report: {Feature}

**Date:** YYYY-MM-DD
**Status:** PASS | FAIL
**App:** {app name}
**Route:** {tested route}
**Ticket/PR:** {link if applicable}

---

## Summary

{Brief description of what was tested and overall result}

---

## Screenshots

| View | Path | Status |
|------|------|--------|
| Desktop (1280x720) | `.agents/QA/screenshots/{date}/{feature}/desktop.png` | Captured |
| Mobile (375x812) | `.agents/QA/screenshots/{date}/{feature}/mobile.png` | Captured |

---

## Interactions Tested

| # | Action | Element | Expected | Actual | Status |
|---|--------|---------|----------|--------|--------|
| 1 | {click/hover/input} | {selector/description} | {expected behavior} | {actual behavior} | PASS/FAIL |

---

## Console Errors

| Type | Message | Source |
|------|---------|--------|
| None | - | - |

---

## Visual Verification

- [ ] Layout renders correctly
- [ ] Responsive breakpoints work
- [ ] Colors/typography match design
- [ ] No visual regressions
- [ ] Loading states display properly
- [ ] Error states handled

---

## Issues Found

| # | Severity | Description | Recommendation |
|---|----------|-------------|----------------|
| 1 | HIGH/MED/LOW | {issue description} | {how to fix} |

Severity Guide:
- **HIGH**: Breaks functionality, must fix before release
- **MED**: Degraded experience, should fix
- **LOW**: Minor polish, nice to have

---

## Recommendation

**READY FOR REVIEW** | **NEEDS FIXES**

{Additional notes or context for the reviewer}
