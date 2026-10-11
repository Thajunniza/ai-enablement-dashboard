# AI Enablement Dashboard

Giving people an AI tool is the easy part. Knowing **who has access** and **who actually uses it** is harder.

This is a small dashboard on SAP BTP that answers those two questions, initiative by initiative. The first initiative is Joule for Consultants (J4C). The built-in analytics show how many people are active; this dashboard shows *which* people, so you can grow adoption, help the people who need it, and stop paying for licences nobody uses.

> Read the story behind it: [Giving people AI is easy. Knowing who uses it is harder.](https://community.sap.com/t5/welcome-corner-blog-posts/giving-people-ai-is-easy-knowing-who-uses-it-is-harder/ba-p/14501242) (SAP Community)

![The three screens of the dashboard](docs/dashboard-overview.png)

*All names and emails in the screenshots are sample data.*

## What it shows

| Screen | What you see |
| --- | --- |
| **Initiatives** | One card per initiative with its status (Live, Coming soon, Inactive), owner, start date and number of enabled users. |
| **Initiative detail** | Enabled users, active users, a trend of unique active users per week, month or year, and the list of people behind each point. |
| **User detail** | One person's first and last seen date, current and longest streak, consistency, and a week-by-week or month-by-month activity strip. |

## How the numbers are made

| Question | Source | When |
| --- | --- | --- |
| Who has access? | Members of the initiative's access group in **SAP Cloud Identity Services** (SCIM API) | Synced every night |
| Who actually signed in? | **SAP Audit Log** (Retrieval API) | Read every day, for the day before |

- A user counts as **active** on a day when a `TokenIssuedEvent` was issued to the Joule application's client for that user. The audit log user is matched to a person by lower-cased email.
- Every write is an **upsert**, so jobs can safely run twice or be repeated for a past date.
- Daily rows are kept for about 7 days and then rolled up into weekly (ISO week), monthly and yearly rows, so first and last seen dates are never lost.
- The dashboard only **reads** the database. Only the two jobs write to it.

```
 SAP Cloud Identity Services (SCIM) ──┐
                                      ├─ Job Scheduling ─▶ CAP service ─▶ PostgreSQL ─▶ Fiori app (Work Zone)
 SAP Audit Log (Retrieval API) ───────┘
```

## Tech stack

- **Backend:** SAP Cloud Application Programming Model (Node.js), OData V4
- **Database:** PostgreSQL
- **UI:** SAP Fiori elements with custom pages (flexible programming model), SAPUI5
- **Auth:** XSUAA with three roles (see below)
- **Jobs:** SAP Job Scheduling service
- **Delivery:** SAP Build Work Zone
- **Packaging:** Multitarget application (MTA)

## Roles and privacy

Names and emails are masked on the server unless the user is allowed to see them.

| Role collection | Can do |
| --- | --- |
| `AI Dashboard Viewer` | See the dashboard with **masked** names and emails |
| `AI Dashboard User Detail` | See **real** names and emails |
| `AI Dashboard Admin` | Everything above, plus trigger the sync jobs by hand |

The Job Scheduling service gets its own scope (`JobScheduler`) so it can call the sync endpoints, and nobody else gets it. Masking happens on the server in the CAP service, not in the UI.

## Service endpoints

| Service | Path | Purpose |
| --- | --- | --- |
| `DashboardService` | `/dashboard` | Read side used by the screens |
| `J4CService` | `/J4C/syncJ4CUsers` | Sync enabled users from SCIM |
| `J4CService` | `/J4C/syncJ4CUsage` | Read the audit log and update usage. Reads yesterday by default. `daysBack` (max 90) backfills older days. |

`/J4C/*` is meant to be called by the Job Scheduling service. Schedule the user sync before the usage sync (for example 00:30 and 01:00).

## Configuration

No secrets are stored in this repository. Values that differ per environment are set outside the code.

| Setting | What it is |
| --- | --- |
| `J4C_DAS_CLIENT_ID` | The `client_id` of the Joule application in its `TokenIssuedEvent` entries. It is specific to your subaccount, so check it in each environment. |
| Destination `IAS_SCIM` | Points to your SAP Cloud Identity Services SCIM API |
| Destination `J4C_AUDITLOG` | Points to your SAP Audit Log Retrieval API |
| Redirect URIs | Your Work Zone URLs. Put them in a `.mtaext` file, based on [`mta-test.mtaext.example`](security/mta-test.mtaext.example), not in `xs-security.json`. |

Do not commit service keys, `.env` files or `.mtaext` files. They are listed in `.gitignore`.

## Run it locally

```bash
npm install
cds watch
```

Open `http://localhost:4004`. Locally the app uses **mocked users** from `.cdsrc.json` instead of XSUAA. A mock user does not get several roles by default, so give the admin user all three roles (`DashboardViewer`, `DashboardUserDetail`, `DashboardAdmin`) or the names will look masked.

The sample CSV data under `test/data` is invented (`User Zero-One`, `usr0001@test.invalid`). Do not run the SCIM sync on top of it. The test users are not in a real group, so the sync would deactivate them.

`test.http` has ready-made requests for the VS Code REST Client extension.

## Tests

```bash
node --test
```

The tests cover the user sync, the usage pipeline, ISO week labels, and the masking rules.

## Deploy to SAP BTP

1. Create the service instances: PostgreSQL, XSUAA, Destination, Job Scheduling, Audit Log (read access), and Work Zone.
2. Copy `security/mta-test.mtaext.example` to `mta-test.mtaext` and fill in your values.
3. Build and deploy:

   ```bash
   mbt build
   cf deploy mta_archives/aiEnablementDashboard_1.0.0.mtar -e mta-test.mtaext
   ```

4. Create the destinations `IAS_SCIM` and `J4C_AUDITLOG`.
5. Assign the role collections to your users in the BTP cockpit.
6. Create two daily jobs in Job Scheduling: `POST /J4C/syncJ4CUsers` and then `POST /J4C/syncJ4CUsage`. For the first run of the usage job, send `{ "daysBack": 90 }` to backfill the audit log's retention window.
7. Add the app to Work Zone.

## Known limits

- **A sign-in is a proxy for use.** The audit log holds token events, not Joule prompts, so "active" means "signed in to Joule that day", not "asked Joule something".
- **Filtering on masked fields can reveal that a value exists.** A user with the Viewer role who filters on a masked field can tell whether a match exists, even though they cannot read it.
- Audit log retention limits how far back you can backfill (up to 90 days here).

## Roadmap

- Filters on the initiatives page (search, status, owner)
- Cost metrics, planned for a later phase
- More initiatives beyond J4C

