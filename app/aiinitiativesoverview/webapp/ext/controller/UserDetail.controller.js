sap.ui.define([
    "sap/fe/core/PageController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/format/DateFormat",
    "sap/ui/core/routing/History",
    "sap/base/Log",
    "../util/constants",
    "../util/service",
    "../util/messages",
    "../util/activity"
], function (PageController, JSONModel, Filter, FilterOperator, DateFormat, History, Log,
    constants, service, messages, activity) {
    "use strict";

    const { ROUTES, MODELS, GRAIN, ODATA, MAX_LIST_ROWS, SAFE_ID_PATTERN, LOG_COMPONENT } = constants;

    // The values the page starts with, and goes back to for every new user
    function defaultUser() {
        return {
            name: "",
            email: "",
            active: false,
            initiativeName: "",
            firstSeen: null,
            lastSeen: null,
            unit: "",                // "weeks" or "months", in the user's language
            currentStreak: 0,
            longestText: "",
            consistencyPct: 0,
            consistencyNote: "",
            busy: false,
            notFound: false
        };
    }

    return PageController.extend("com.sap.aiinitiativesoverview.ext.controller.UserDetail", {

        onInit() {
            PageController.prototype.onInit.apply(this, arguments);

            this._sInitiativeId = null;
            this._sScimId = null;
            this._sGrain = GRAIN.WEEKLY;
            this._iReq = 0;                       // changes on every route match: late answers are dropped
            this._aRoster = [];                   // all ActiveUsers rows of this person
            this._mUniverse = { [GRAIN.WEEKLY]: [], [GRAIN.MONTHLY]: [] };   // known period labels per grain

            this._oRoute = this.getAppComponent().getRouter().getRoute(ROUTES.USER_DETAIL);
            this._oRoute.attachPatternMatched(this._onRouteMatched, this);

            this.getView().setModel(new JSONModel(defaultUser()), MODELS.USER);
            this.getView().setModel(new JSONModel({ groups: [], rows: [] }), MODELS.ACTIVITY);
        },

        onExit() {
            this._oRoute.detachPatternMatched(this._onRouteMatched, this);
            if (PageController.prototype.onExit) {
                PageController.prototype.onExit.apply(this, arguments);
            }
        },

        async _onRouteMatched(oEvent) {
            const { initiativeId, scimId } = oEvent.getParameter("arguments");

            if (!SAFE_ID_PATTERN.test(initiativeId || "") || !scimId) {
                Log.error("Invalid initiative or user id in the URL", "", LOG_COMPONENT);
                messages.show(this.getView(), "msg_invalid_user");
                this.getAppComponent().getRouter().navTo(ROUTES.MAIN, {}, true);
                return;
            }

            const iReq = ++this._iReq;
            this._sInitiativeId = initiativeId;
            this._sScimId = scimId;
            this._sGrain = GRAIN.WEEKLY;
            this._aRoster = [];
            this._mUniverse = { [GRAIN.WEEKLY]: [], [GRAIN.MONTHLY]: [] };

            // Start clean, so nothing from the previous user is shown while this one loads
            this._user().setData({ ...defaultUser(), busy: true });
            this.getView().getModel(MODELS.ACTIVITY).setData({ groups: [], rows: [] });
            const oToggle = this.byId("userGrainToggle");
            if (oToggle) {
                oToggle.setSelectedKey(GRAIN.WEEKLY);
            }

            try {
                const [oProfile, aRoster, aWeeks, aMonths] = await Promise.all([
                    this._fetchProfile(),
                    this._fetchRoster(),
                    this._fetchUniverse(GRAIN.WEEKLY),
                    this._fetchUniverse(GRAIN.MONTHLY)
                ]);
                if (iReq !== this._iReq) {
                    return;      // a newer navigation took over
                }
                if (!oProfile) {
                    this._user().setProperty("/notFound", true);
                    this._user().setProperty("/name", this._sScimId);
                    return;
                }
                const oUser = this._user();
                oUser.setProperty("/name", oProfile.name);
                oUser.setProperty("/email", oProfile.email);
                oUser.setProperty("/active", oProfile.active);
                oUser.setProperty("/initiativeName", oProfile.initiativeName);

                this._aRoster = aRoster;
                this._mUniverse = { [GRAIN.WEEKLY]: aWeeks, [GRAIN.MONTHLY]: aMonths };
                if (aRoster.length >= MAX_LIST_ROWS) {
                    messages.show(this.getView(), "msg_periods_truncated", [MAX_LIST_ROWS]);
                }
                this._computeFirstLast();
                this._renderGrain();
            } catch (oError) {
                if (iReq === this._iReq) {
                    messages.report(this.getView(), "msg_load_user_failed", oError);
                }
            } finally {
                if (iReq === this._iReq) {
                    this._user().setProperty("/busy", false);
                }
            }
        },

        // ── DATA LOADING ──────────────────────────────────────────────

        _odata() {
            return this.getView().getModel();
        },

        _user() {
            return this.getView().getModel(MODELS.USER);
        },

        // Resolves with the profile, or null when the person is not returned by the service.
        // Names and emails arrive already masked by the server unless the user has the detail role.
        async _fetchProfile() {
            const aRows = await service.requestRows(
                this._odata(),
                ODATA.PERSONS,
                [
                    new Filter("scimId", FilterOperator.EQ, this._sScimId),
                    new Filter("initiative_ID", FilterOperator.EQ, this._sInitiativeId)
                ],
                undefined,
                (o) => ({
                    name: o.displayName || [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || o.scimId,
                    email: o.email,
                    active: !!o.active,
                    initiativeName: o.initiativeName
                })
            );
            return aRows.length ? aRows[0] : null;
        },

        // All period rows of this person (every grain)
        _fetchRoster() {
            return service.requestRows(
                this._odata(),
                ODATA.ACTIVE_USERS,
                [
                    new Filter("person_scimId", FilterOperator.EQ, this._sScimId),
                    new Filter("person_initiative_ID", FilterOperator.EQ, this._sInitiativeId)
                ],
                undefined,
                (o) => ({ grain: o.grain, periodLabel: o.periodLabel, firstSeen: o.firstSeen, lastSeen: o.lastSeen })
            );
        },

        // The period labels that exist for this initiative (from getTrendCounts), so that periods
        // where this person was away show up as gaps. A period in which nobody at all was active
        // is not in this list. If the call fails the page still works, just without the gaps.
        async _fetchUniverse(sGrain) {
            try {
                const oResult = await service.callFunction(
                    this._odata(), ODATA.FN_TREND, { initiativeId: this._sInitiativeId, grain: sGrain });
                return (oResult.value || []).map((o) => o.periodLabel);
            } catch (oError) {
                Log.warning(`Could not read the ${sGrain} period list, gaps are not shown`, oError && oError.message, LOG_COMPONENT);
                return [];
            }
        },

        // ── DERIVED VALUES ────────────────────────────────────────────

        // First and last time the person was seen, across every grain
        _computeFirstLast() {
            let sFirst = null;
            let sLast = null;
            this._aRoster.forEach((r) => {
                if (r.firstSeen && (!sFirst || r.firstSeen < sFirst)) {
                    sFirst = r.firstSeen;
                }
                if (r.lastSeen && (!sLast || r.lastSeen > sLast)) {
                    sLast = r.lastSeen;
                }
            });
            this._user().setProperty("/firstSeen", sFirst);
            this._user().setProperty("/lastSeen", sLast);
        },

        // The 12 month names in the user's language
        _monthNames() {
            const oFormat = DateFormat.getDateInstance({ pattern: "MMM", UTC: true });
            return Array.from({ length: 12 }, (_, i) => oFormat.format(new Date(Date.UTC(2000, i, 1))));
        },

        _renderGrain() {
            const oView = this.getView();
            const sGrain = this._sGrain;

            const mMine = {};
            this._aRoster.filter((r) => r.grain === sGrain).forEach((r) => {
                mMine[r.periodLabel] = r;
            });

            // known periods plus any period of this person that is not in the list
            const aLabels = [...new Set([...(this._mUniverse[sGrain] || []), ...Object.keys(mMine)])].sort();

            const { stats, groups } = activity.buildActivity({
                labels: aLabels,
                mine: mMine,
                grain: sGrain,
                monthNames: this._monthNames(),
                texts: {
                    pre: messages.getText(oView, "activity_tip_pre"),
                    none: messages.getText(oView, "activity_tip_none")
                }
            });

            const sUnit = messages.getText(oView, sGrain === GRAIN.WEEKLY ? "unit_weeks" : "unit_months");
            const oUser = this._user();
            oUser.setProperty("/unit", sUnit);
            oUser.setProperty("/currentStreak", stats.currentStreak);
            oUser.setProperty("/longestText", messages.getText(oView, "stat_longest_note", [stats.longestStreak, sUnit]));
            oUser.setProperty("/consistencyPct", stats.consistencyPct);
            oUser.setProperty("/consistencyNote", messages.getText(
                oView, "stat_consistency_note", [stats.activePeriods, stats.periodsSinceFirst, sUnit]));

            const aRows = Object.keys(mMine).sort().reverse().map((sLabel) => ({
                periodLabel: sLabel,
                firstSeen: mMine[sLabel].firstSeen,
                lastSeen: mMine[sLabel].lastSeen
            }));
            oView.getModel(MODELS.ACTIVITY).setData({ groups, rows: aRows });
        },

        // ── EVENT HANDLERS ────────────────────────────────────────────

        onGrainToggle(oEvent) {
            this._sGrain = oEvent.getParameter("item").getKey();
            this._renderGrain();
        },

        onNavBack() {
            if (History.getInstance().getPreviousHash() !== undefined) {
                window.history.go(-1);
            } else {
                this.getAppComponent().getRouter().navTo(
                    ROUTES.INITIATIVE_DETAIL, { initiativeId: this._sInitiativeId });
            }
        }
    });
});