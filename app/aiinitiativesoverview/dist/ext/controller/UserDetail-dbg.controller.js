sap.ui.define([
    "sap/fe/core/PageController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/ui/core/routing/History"
], function (PageController, JSONModel, Filter, FilterOperator, MessageToast, History) {
    "use strict";

    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return PageController.extend("com.sap.aiinitiativesoverview.ext.controller.UserDetail", {

        onInit: function () {
            PageController.prototype.onInit.apply(this, arguments);

            this._sInitiativeId = null;
            this._sScimId = null;
            this._sGrain = "WEEKLY";
            this._iReq = 0;                       // guards against out-of-order responses
            this._aRoster = [];                   // all ActiveUsers rows of this person
            this._mUniverse = { WEEKLY: [], MONTHLY: [] };   // known period labels per grain

            this.oRouter = this.getAppComponent().getRouter();
            this.oRouter
                .getRoute("UserDetail")
                .attachPatternMatched(this._onRouteMatched, this);

            this.getView().setModel(new JSONModel({
                name: "",
                email: "",
                active: false,
                initiativeName: "",
                firstSeen: "",
                lastSeen: "",
                grain: "WEEKLY",
                currentStreak: 0,
                longestStreak: 0,
                consistencyPct: 0,
                activePeriods: 0,
                periodsSinceFirst: 0,
                busy: false,
                notFound: false
            }), "userModel");

            this.getView().setModel(new JSONModel({ groups: [], rows: [] }), "activityModel");
        },

        _onRouteMatched: function (oEvent) {
            var that = this;
            var mArgs = oEvent.getParameter("arguments");
            this._sInitiativeId = mArgs.initiativeId;
            this._sScimId = mArgs.scimId;       // the router already decodes route parameters
            this._sGrain = "WEEKLY";
            var iReq = ++this._iReq;

            var oToggle = this.byId("userGrainToggle");
            if (oToggle) { oToggle.setSelectedKey("WEEKLY"); }

            this._aRoster = [];
            this._mUniverse = { WEEKLY: [], MONTHLY: [] };
            this._user().setData({
                name: "", email: "", active: false, initiativeName: "",
                firstSeen: "", lastSeen: "", grain: "WEEKLY",
                currentStreak: 0, longestStreak: 0, consistencyPct: 0,
                activePeriods: 0, periodsSinceFirst: 0,
                busy: true, notFound: false
            });
            this.getView().getModel("activityModel").setData({ groups: [], rows: [] });

            Promise.all([
                this._fetchProfile(),
                this._fetchRoster(),
                this._fetchUniverse("WEEKLY"),
                this._fetchUniverse("MONTHLY")
            ]).then(function (aRes) {
                if (iReq !== that._iReq) { return; }      // a newer navigation took over
                var oProfile = aRes[0];
                if (!oProfile) {
                    that._user().setProperty("/notFound", true);
                    that._user().setProperty("/name", that._sScimId);
                    that._user().setProperty("/busy", false);
                    return;
                }
                that._user().setProperty("/name", oProfile.name);
                that._user().setProperty("/email", oProfile.email);
                that._user().setProperty("/active", oProfile.active);
                that._user().setProperty("/initiativeName", oProfile.initiativeName);
                that._aRoster = aRes[1];
                that._mUniverse = { WEEKLY: aRes[2], MONTHLY: aRes[3] };
                that._computeStats();
                that._renderGrain();
                that._user().setProperty("/busy", false);
            }).catch(function () {
                if (iReq !== that._iReq) { return; }
                that._user().setProperty("/busy", false);
                MessageToast.show("Failed to load user details");
            });
        },

        // ── DATA LOADING ──────────────────────────────────────────────

        _requestRows: function (sPath, aFilters, mParameters, fnMap) {
            var oBinding = this.getView().getModel().bindList(sPath, null, [], aFilters, mParameters);
            return oBinding.requestContexts(0, 500).then(function (aContexts) {
                var aRows = aContexts.map(function (oContext) { return fnMap(oContext.getObject()); });
                oBinding.destroy();
                return aRows;
            });
        },

        // Resolves with the profile, or null when the person is not returned by the service
        _fetchProfile: function () {
            return this._requestRows(
                "/Persons",
                [
                    new Filter("scimId", FilterOperator.EQ, this._sScimId),
                    new Filter("initiative_ID", FilterOperator.EQ, this._sInitiativeId)
                ],
                undefined,
                function (o) {
                    return {
                        name: o.displayName || [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || o.scimId,
                        email: o.email,
                        active: !!o.active,
                        initiativeName: o.initiativeName
                    };
                }
            ).then(function (aRows) { return aRows.length ? aRows[0] : null; });
        },

        // All period rows of this person (WEEKLY, MONTHLY and YEARLY)
        _fetchRoster: function () {
            return this._requestRows(
                "/ActiveUsers",
                [
                    new Filter("person_scimId", FilterOperator.EQ, this._sScimId),
                    new Filter("person_initiative_ID", FilterOperator.EQ, this._sInitiativeId)
                ],
                undefined,
                function (o) {
                    return {
                        grain: o.grain,
                        periodLabel: o.periodLabel,
                        firstSeen: o.firstSeen,
                        lastSeen: o.lastSeen
                    };
                }
            );
        },

        // Period labels that exist in the data (from getTrendCounts, not scoped to one
        // initiative). Used only so that periods without activity show up as gaps.
        _fetchUniverse: function (sGrain) {
            var oFunctionContext = this.getView().getModel().bindContext("/getTrendCounts(...)");
            oFunctionContext.setParameter("initiativeId", this._sInitiativeId);
            oFunctionContext.setParameter("grain", sGrain);
            return oFunctionContext.invoke()
                .then(function () {
                    var aValues = oFunctionContext.getBoundContext().getObject().value || [];
                    return aValues.map(function (o) { return o.periodLabel; });
                })
                .catch(function () { return []; });
        },

        // ── DERIVED VALUES ────────────────────────────────────────────

        // First seen / last seen across every grain
        _computeStats: function () {
            var sFirst = "";
            var sLast = "";
            this._aRoster.forEach(function (r) {
                if (r.firstSeen && (!sFirst || r.firstSeen < sFirst)) { sFirst = r.firstSeen; }
                if (r.lastSeen && (!sLast || r.lastSeen > sLast)) { sLast = r.lastSeen; }
            });
            this._user().setProperty("/firstSeen", sFirst);
            this._user().setProperty("/lastSeen", sLast);
        },

        // Monday of an ISO week label such as "2026-W39" (UTC)
        _isoWeekStart: function (sLabel) {
            var aParts = sLabel.split("-W");
            var iYear = parseInt(aParts[0], 10);
            var iWeek = parseInt(aParts[1], 10);
            var oJan4 = new Date(Date.UTC(iYear, 0, 4));
            var iDow = oJan4.getUTCDay() || 7;
            return new Date(oJan4.getTime() + ((iWeek - 1) * 7 - (iDow - 1)) * 86400000);
        },

        // Which group row a period belongs to, plus the short text on its box
        _describe: function (sLabel, sGrain) {
            var aParts = sLabel.split("-");
            if (sGrain === "WEEKLY") {
                var oStart = this._isoWeekStart(sLabel);
                var iMonth = oStart.getUTCMonth();
                var iYear = oStart.getUTCFullYear();
                return {
                    groupKey: iYear * 12 + iMonth,
                    groupTitle: MONTHS[iMonth] + " " + iYear,
                    text: aParts[1] || sLabel                       // "2026-W39" -> "W39"
                };
            }
            var iM = parseInt(aParts[1], 10);
            return {
                groupKey: parseInt(aParts[0], 10),
                groupTitle: aParts[0],
                text: iM ? MONTHS[iM - 1] : sLabel                  // "2026-09" -> "Sep"
            };
        },

        _renderGrain: function () {
            var that = this;
            var sGrain = this._sGrain;
            var mMine = {};
            this._aRoster.forEach(function (r) {
                if (r.grain === sGrain) { mMine[r.periodLabel] = r; }
            });

            // known periods plus any period of this person that is not in the list yet
            var aLabels = (this._mUniverse[sGrain] || []).slice();
            Object.keys(mMine).forEach(function (sLabel) {
                if (aLabels.indexOf(sLabel) < 0) { aLabels.push(sLabel); }
            });
            aLabels.sort();

            // periods before the person's first active period are "pre" (before first use)
            var iFirst = -1;
            aLabels.forEach(function (sLabel, i) {
                if (iFirst < 0 && mMine[sLabel]) { iFirst = i; }
            });

            // streaks and consistency, counted from first use to the latest known period
            var iActive = 0;
            var iLongest = 0;
            var iRun = 0;
            if (iFirst >= 0) {
                aLabels.slice(iFirst).forEach(function (sLabel) {
                    if (mMine[sLabel]) {
                        iActive++;
                        iRun++;
                        if (iRun > iLongest) { iLongest = iRun; }
                    } else {
                        iRun = 0;
                    }
                });
            }
            var iSince = iFirst >= 0 ? aLabels.length - iFirst : 0;

            var oUser = this._user();
            oUser.setProperty("/grain", sGrain);
            oUser.setProperty("/currentStreak", iRun);               // run that ends at the latest period
            oUser.setProperty("/longestStreak", iLongest);
            oUser.setProperty("/activePeriods", iActive);
            oUser.setProperty("/periodsSinceFirst", iSince);
            oUser.setProperty("/consistencyPct", iSince ? Math.round(iActive / iSince * 100) : 0);

            // cells grouped into month rows (weekly) or year rows (monthly)
            var aGroups = [];
            var mGroupIndex = {};
            aLabels.forEach(function (sLabel, i) {
                var oInfo = that._describe(sLabel, sGrain);
                var r = mMine[sLabel];
                var sStatus = r ? "on" : ((iFirst >= 0 && i < iFirst) ? "pre" : "off");
                var sTip = sLabel + ": " + (r ? r.firstSeen + " – " + r.lastSeen
                    : (sStatus === "pre" ? "before first use" : "no activity"));
                if (mGroupIndex[oInfo.groupKey] === undefined) {
                    mGroupIndex[oInfo.groupKey] = aGroups.length;
                    aGroups.push({ title: oInfo.groupTitle, cells: [] });
                }
                aGroups[mGroupIndex[oInfo.groupKey]].cells.push({
                    label: oInfo.text,
                    status: sStatus,
                    tip: sTip
                });
            });

            var aRows = Object.keys(mMine).sort().reverse().map(function (sLabel) {
                return {
                    periodLabel: sLabel,
                    firstSeen: mMine[sLabel].firstSeen,
                    lastSeen: mMine[sLabel].lastSeen
                };
            });

            this.getView().getModel("activityModel").setData({ groups: aGroups, rows: aRows });
        },

        // ── EVENT HANDLERS ────────────────────────────────────────────

        onGrainToggle: function (oEvent) {
            this._sGrain = oEvent.getParameter("item").getKey();
            this._renderGrain();
        },

        onNavBack: function () {
            var sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.oRouter.navTo("InitiativeDetail", { initiativeId: this._sInitiativeId });
            }
        },

        _user: function () {
            return this.getView().getModel("userModel");
        }
    });
});