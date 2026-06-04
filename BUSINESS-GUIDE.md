# AI Proposal Generator — Business Team Guide

---

## The Problem — What Challenges Does This Solve?

Before this system, generating a proposal for a new client required:

- A sales or technical person to **manually read every lead email**
- Someone to **write the proposal from scratch** — often 2–4 hours of effort
- Back-and-forth to gather missing details (timeline, team size, requirements)
- **Delays of 24–72 hours** before the client received anything
- Inconsistent quality — proposals varied based on who wrote them and how much time they had
- Missed leads — emails sitting unread over weekends or during busy periods
- No central storage — proposals scattered across local drives and email threads

**The result:** Slow response times, inconsistent proposals, and sales opportunities lost to competitors who responded faster.

---

## What This System Does

When a potential client reaches out (by email or web form), this system automatically:

1. Detects the incoming lead (email or Typeform submission)
2. Uses AI to read and understand what the client needs
3. Generates a full, professional proposal tailored to their specific requirements
4. Saves the proposal as a Word document to Google Drive (shared, accessible by the team)
5. Emails the proposal to the manager within minutes — document attached, Drive link included

**No manual work. No waiting. The proposal is ready within 2 minutes of the lead arriving.**

---

## The Benefits

| Benefit | Details |
|---|---|
| **Speed** | Proposal delivered in under 2 minutes vs. 24–72 hours manually |
| **Always on** | System runs 24/7 — leads on weekends and holidays are never missed |
| **Consistent quality** | Every proposal follows the same professional structure, every time |
| **Zero effort for sales team** | Once Gmail filters are set up per client domain, nothing else is needed |
| **Centralised storage** | Every proposal saved to Google Drive — no scattered files |
| **Scales without headcount** | Handle 10 leads or 100 leads with the same zero manual effort |
| **Audit trail** | Each email is labelled `processed-proposal` in Gmail — easy to track what was handled |
| **Reduces human error** | AI extracts client details from the email — no copy-paste mistakes in proposals |

---

## Who Is This For

| Role | What They Do |
|---|---|
| **Sales / Ops Team** | Sets up Gmail filters for new clients; monitors the inbox |
| **Manager / Reviewer** | Receives the proposal email; reviews and sends to the client |
| **Developer (Dib)** | Maintains the system; deploys updates |

---

## How a Lead Becomes a Proposal

### Path 1 — Client Sends an Email

```
Client sends email to dibyendumondal87@gmail.com
        ↓
Gmail filter applies label "proposal-leads" automatically
        ↓
System checks inbox every 15 minutes
        ↓
AI reads the email and extracts: name, company, requirement, timeline, team size
        ↓
AI writes a full proposal (10 sections)
        ↓
Proposal saved as .docx to Google Drive
        ↓
Manager receives email with proposal attached + Drive link
```

### Path 2 — Client Fills a Web Form (Typeform)

```
Client submits the Typeform
        ↓
Typeform sends the data instantly to this system
        ↓
AI writes a full proposal (10 sections)
        ↓
Proposal saved as .docx to Google Drive
        ↓
Manager receives email with proposal attached + Drive link
```

---

## What the Proposal Contains

The AI generates these 10 sections automatically:

1. Executive Summary
2. Understanding of Requirements
3. Proposed Solution
4. Technical Approach
5. Project Timeline
6. Team Structure
7. Pricing / Investment
8. Why Choose Us (BharatAISolution)
9. Risk Mitigation
10. Next Steps

---

## Daily Operations — Sales Team

### When a New Client Domain Is Onboarded

You need to add one Gmail filter so their emails get picked up automatically.

**Steps:**
1. Open Gmail → Settings (gear icon) → See all settings
2. Click **Filters and Blocked Addresses** → **Create a new filter**
3. In the **From** field, type: `*@clientdomain.com` (replace with actual domain)
4. Click **Create filter**
5. Check **Apply the label** → select `proposal-leads`
6. Check **Also apply filter to matching conversations** (optional — for existing emails)
7. Click **Create filter**

That's it. All future emails from that domain will be auto-labelled and picked up within 15 minutes.

---

### How to Send a Lead Manually (If Needed)

If you receive a lead through other channels (phone, WhatsApp, referral) and want to generate a proposal:

1. Write an email to `dibyendumondal87@gmail.com`
2. Include: client name, company, what they need, timeline, team size
3. In Gmail, find the email → add the label `proposal-leads`
4. The system will pick it up within 15 minutes

---

### Checking If a Lead Was Processed

After a lead email is processed, Gmail automatically:
- Removes the UNREAD status
- Adds the label `processed-proposal`

If an email still shows `proposal-leads` but NOT `processed-proposal` after 20 minutes, something may have gone wrong — notify the developer.

---

## Manager — Reviewing Proposals

When a proposal is generated, you receive an email with:
- **Subject:** `New Proposal Ready — [Company Name] ([Prospect Name])`
- **Body:** Lead summary table + executive summary preview + Google Drive link
- **Attachment:** The full `.docx` proposal

**To review:** Click the Google Drive link or open the attachment.

**To send to the client:** Review the proposal, make any edits in Google Drive or locally, then forward/send from your own email.

---

## Troubleshooting

### "The email came in but no proposal was generated"

**Check 1:** Does the email have the `proposal-leads` label in Gmail?
- If no → the Gmail filter wasn't triggered. Add the filter for that sender's domain (see setup steps above), then manually add the label to the email.

**Check 2:** Does the email have the `processed-proposal` label?
- If no → the system tried but may have failed. Check with the developer.

**Check 3:** Did the system pick it up yet?
- The poller runs every 15 minutes. Wait up to 20 minutes before escalating.

---

### "The proposal email didn't arrive"

1. Check your spam/junk folder
2. Check if a Drive file was created — go to the Google Drive folder
3. If the Drive file exists but no email: the email step failed. Forward the Drive link manually to the client while the developer investigates.
4. If no Drive file: the entire pipeline failed. Notify the developer with the client's email details.

---

### "The proposal content looks wrong or generic"

The AI works best when the client's email is detailed. If the client wrote a very short or vague email, the proposal will reflect that.

**Fix:** Ask the client for more details (requirement, timeline, team size, specific tools/frameworks), then re-send the email with the additional info and apply the `proposal-leads` label again.

---

### "A client sent multiple emails and we got duplicate proposals"

The system has duplicate prevention — if the same email is processed twice, the second run is ignored. However, if the client sent *two different emails*, two proposals will be generated. This is expected behavior.

---

## Key Contacts and Resources

| Item | Detail |
|---|---|
| Inbox being monitored | `dibyendumondal87@gmail.com` |
| Manager who receives proposals | `dibofficial87@gmail.com` |
| Google Drive folder | [AI Proposal folder on Drive](https://drive.google.com/drive/folders/1Tx_kdOyGiDtIB_phWRRK2I7H78vWbUzz) |
| Company name in proposals | BharatAISolution |
| Developer | Dib (`dibyendumondal87@gmail.com`) |
| Polling frequency | Every 15 minutes (automatic, no manual trigger needed) |

---

## What the Sales Team Does NOT Need to Do

- No manual proposal writing
- No formatting or document creation
- No uploading to Drive
- No triggering the system — it runs on its own
- No code changes when onboarding new clients — just add a Gmail filter

---

## Setup Checklist (For Developer Reference)

| Item | Status |
|---|---|
| Gmail labels `proposal-leads` and `processed-proposal` created | Done |
| Gmail OAuth2 credentials configured | Done |
| Google Drive folder created and linked | Done |
| Anthropic (Claude AI) API connected | Done |
| Manager email configured | Done |
| Pipeline tested end-to-end | Done |
| **Deployed to cloud (auto-runs every 15 min)** | **PENDING** |
| Typeform webhook connected | Optional |
