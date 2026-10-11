sap.ui.define([
    "sap/fe/core/PageController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/routing/History",
    "sap/base/Log",
    "../util/constants",
    "../util/formatter",
    "../util/service",
    "../util/messages"
], function (PageController, JSONModel, Filter, FilterOperator, History, Log, constants, formatter, service, messages) {
    "use strict";

    const {
        ROUTES, MODELS, GRAIN, DEFAULT_GRAIN, LIST_MODE, ODATA, MAX_LIST_ROWS,
        SAFE_ID_PATTERN, CHART_PERIOD_DIMENSION, SELECTED_CARD_CLASS, LOG_COMPONENT
    } = constants;

    // The values the detail page starts with, and goes back to for every new initiative
    function defaultDetail() {
        return {
            name: "",
            status: "",
            owner: "",
            launchDate: null,
            iasGroup: "",
            enabledUsersCount: 0,
            activeUsersCount: 0,
            listMode: LIST_MODE.ENABLED,
            listPeriod: "",          // period shown in the list subtitle
            listCount: 0,
            listBusy: false
        };
    }

    return PageController.extend("com.sap.aiinitiativesoverview.ext.controller.Detail", {

        // Used in the view as .formatter.<name>
        formatter,

        onInit() {
            PageController.prototype.onInit.apply(this, arguments);

            this._sInitiativeId = null;
            this._sGrain = DEFAULT_GRAIN;
            this._sLatestMonthly = "";
            this._iRouteReq = 0;      // changes on every route match: late answers for an old initiative are dropped
            this._iListReq = 0;       // same idea for the user list: only the newest request may fill it
            this._bCardsWired = false;

            this._oRoute = this.getAppComponent().getRouter().getRoute(ROUTES.INITIATIVE_DETAIL);
            this._oRoute.attachPatternMatched(this._onRouteMatched, this);

            const oView = this.getView();
            oView.setModel(new JSONModel(defaultDetail()), MODELS.DETAIL);
            oView.setModel(new JSONModel({ results: [] }), MODELS.TREND);
            oView.setModel(new JSONModel([]), MODELS.USER_LIST);

            // The KPI cards are plain boxes: they are made clickable once the view has rendered
            oView.addEventDelegate({ onAfterRendering: this._wireCards }, this);
        },

        onExit() {
            this._oRoute.detachPatternMatched(this._onRouteMatched, this);
            if (PageController.prototype.onExit) {
                PageController.prototype.onExit.apply(this, arguments);
            }
        },

        _onRouteMatched(oEvent) {
            const sId = oEvent.getParameter("arguments").initiativeId;

            // The id goes into an OData path below, so a hand-edited URL must not get through
            if (!SAFE_ID_PATTERN.test(sId || "")) {
                Log.error("Invalid initiative id in the URL", "", LOG_COMPONENT);
                messages.show(this.getView(), "msg_invalid_initiative");
                this.getAppComponent().getRouter().navTo(ROUTES.MAIN, {}, true);
                return;
            }

            const iRoute = ++this._iRouteReq;
            this._sInitiativeId = sId;
            this._sGrain = DEFAULT_GRAIN;
            this._sLatestMonthly = "";

            // Start clean, so nothing from the previous initiative is shown while this one loads
            this._detail().setData(defaultDetail());
            this.getView().getModel(MODELS.TREND).setData({ results: [] });
            this.getView().getModel(MODELS.USER_LIST).setData([]);
            const oToggle = this.byId("grainToggle");
            if (oToggle) {
                oToggle.setSelectedKey(DEFAULT_GRAIN);
            }

            this._loadInitiative(sId, iRoute);
            this._loadEnabledUserCount(sId, iRoute);
            this._showEnabledList();
            this._wireCards();
            this._loadActiveUsersKpi(iRoute);
        },

        // ── DATA LOADING ──────────────────────────────────────────────

        _odata() {
            return this.getView().getModel();
        },

        _detail() {
            return this.getView().getModel(MODELS.DETAIL);
        },

        async _loadInitiative(sId, iRoute) {
            const oBinding = this._odata().bindContext(`${ODATA.INITIATIVES}(${sId})`);
            try {
                const oData = await oBinding.requestObject();
                if (iRoute !== this._iRouteReq) {
                    return;
                }
                const oDetail = this._detail();
                oDetail.setProperty("/name", oData.name || "");
                oDetail.setProperty("/status", oData.status || "");
                oDetail.setProperty("/owner", oData.owner || "");
                oDetail.setProperty("/launchDate", oData.launchDate || null);
                oDetail.setProperty("/iasGroup", oData.iasGroup || "");
            } catch (oError) {
                this._reportError("msg_load_initiative_failed", oError);
            } finally {
                oBinding.destroy();
            }
        },

        async _loadEnabledUserCount(sId, iRoute) {
            try {
                const oResult = await service.callFunction(this._odata(), ODATA.FN_ENABLED_COUNT, { initiativeId: sId });
                if (iRoute === this._iRouteReq) {
                    this._detail().setProperty("/enabledUsersCount", oResult.count || 0);
                }
            } catch (oError) {
                this._reportError("msg_load_enabled_count_failed", oError);
            }
        },

        // The "Active users" card shows the latest month. The month comes from the trend,
        // and the number is counted by the server (not by counting loaded rows).
        async _loadActiveUsersKpi(iRoute) {
            try {
                const aTrend = await this._loadTrendCounts(GRAIN.MONTHLY, iRoute);
                if (iRoute !== this._iRouteReq || !aTrend.length) {
                    return;
                }
                this._sLatestMonthly = aTrend[aTrend.length - 1].periodLabel;
                const iCount = await service.countRows(this._odata(), 
                    ODATA.ACTIVE_USERS, this._activeFilters(GRAIN.MONTHLY, this._sLatestMonthly));
                if (iRoute === this._iRouteReq) {
                    this._detail().setProperty("/activeUsersCount", iCount);
                }
            } catch (oError) {
                this._reportError("msg_load_active_failed", oError);
            }
        },

        // Always resolves with the trend array. Only the newest request may update the chart.
        async _loadTrendCounts(sGrain, iRoute) {
            let aResults = [];
            try {
                const oResult = await service.callFunction(this._odata(), 
                    ODATA.FN_TREND, { initiativeId: this._sInitiativeId, grain: sGrain });
                aResults = (oResult.value || []).map((o) => ({
                    periodLabel: o.periodLabel,
                    activeCount: o.activeCount
                }));
            } catch (oError) {
                this._reportError("msg_load_trend_failed", oError);
            }
            if (iRoute === this._iRouteReq && sGrain === this._sGrain) {
                this.getView().getModel(MODELS.TREND).setProperty("/results", aResults);
            }
            return aResults;
        },

        _activeFilters(sGrain, sPeriod) {
            return [
                new Filter("grain", FilterOperator.EQ, sGrain),
                new Filter("periodLabel", FilterOperator.EQ, sPeriod),
                new Filter("person_initiative_ID", FilterOperator.EQ, this._sInitiativeId)
            ];
        },

        // Names and emails arrive already masked by the server unless the user has the detail role
        _personName(o) {
            return o.displayName || [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || "";
        },

        _fetchEnabledPersons() {
            return service.requestRows(this._odata(), 
                ODATA.PERSONS,
                [new Filter("initiative_ID", FilterOperator.EQ, this._sInitiativeId)],
                undefined,
                (o) => ({ scimId: o.scimId, name: this._personName(o), email: o.email, active: !!o.active })
            );
        },

        _fetchActiveRoster(sGrain, sPeriod) {
            return service.requestRows(this._odata(), 
                ODATA.ACTIVE_USERS,
                this._activeFilters(sGrain, sPeriod),
                { $expand: "person" },
                (o) => {
                    const p = o.person || {};
                    return {
                        scimId: p.scimId,
                        name: this._personName(p),
                        email: p.email,
                        firstSeen: o.firstSeen,
                        lastSeen: o.lastSeen
                    };
                }
            );
        },

        // ── LIST SWITCHING ────────────────────────────────────────────

        async _showEnabledList() {
            const iReq = ++this._iListReq;
            this._setMode(LIST_MODE.ENABLED, "");
            this._setBusy(true);
            try {
                const aRows = await this._fetchEnabledPersons();
                if (iReq === this._iListReq) {
                    this._applyRows(aRows);
                }
            } catch (oError) {
                if (iReq === this._iListReq) {
                    this._applyRows([]);
                    this._reportError("msg_load_enabled_failed", oError);
                }
            }
        },

        async _showActiveList(sGrain, sPeriod) {
            const iReq = ++this._iListReq;
            this._setMode(LIST_MODE.ACTIVE, sPeriod || "");
            if (!sPeriod) {
                this._applyRows([]);
                return;
            }
            this._setBusy(true);
            try {
                const aRows = await this._fetchActiveRoster(sGrain, sPeriod);
                if (iReq === this._iListReq) {
                    this._applyRows(aRows);
                }
            } catch (oError) {
                if (iReq === this._iListReq) {
                    this._applyRows([]);
                    this._reportError("msg_load_active_failed", oError);
                }
            }
        },

        _applyRows(aRows) {
            this.getView().getModel(MODELS.USER_LIST).setData(aRows);
            this._detail().setProperty("/listCount", aRows.length);
            this._setBusy(false);
            if (aRows.length >= MAX_LIST_ROWS) {
                messages.show(this.getView(), "msg_list_truncated", [MAX_LIST_ROWS]);
            }
        },

        _setMode(sMode, sPeriod) {
            this._detail().setProperty("/listMode", sMode);
            this._detail().setProperty("/listPeriod", sPeriod);
            this._markCards(sMode);
        },

        _setBusy(bBusy) {
            this._detail().setProperty("/listBusy", bBusy);
        },

        _markCards(sMode) {
            const mCards = { enabledUsersKpi: LIST_MODE.ENABLED, activeUsersKpi: LIST_MODE.ACTIVE };
            Object.entries(mCards).forEach(([sId, sCardMode]) => {
                const oCard = this.byId(sId);
                if (!oCard) {
                    return;   // not created yet; marked again when the cards are wired
                }
                const bSelected = sMode === sCardMode;
                oCard.toggleStyleClass(SELECTED_CARD_CLASS, bSelected);
                const oDom = oCard.getDomRef();
                if (oDom) {
                    oDom.setAttribute("aria-pressed", String(bSelected));
                }
            });
        },

        _latestPeriod() {
            const aResults = this.getView().getModel(MODELS.TREND).getProperty("/results") || [];
            return aResults.length ? aResults[aResults.length - 1].periodLabel : "";
        },

        _scrollToList() {
            const oSection = this.byId("userListSection");
            const oDom = oSection && oSection.getDomRef();
            if (oDom && oDom.scrollIntoView) {
                oDom.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        },

        // ── KPI CARD CLICK WIRING ─────────────────────────────────────

        _wireCards() {
            if (this._bCardsWired) {
                return;
            }
            const oEnabled = this.byId("enabledUsersKpi");
            const oActive = this.byId("activeUsersKpi");
            if (!oEnabled || !oActive) {
                return;   // not created yet; tried again after the next rendering
            }
            this._makeClickable(oEnabled, this.onEnabledCardPress, LIST_MODE.ENABLED);
            this._makeClickable(oActive, this.onActiveCardPress, LIST_MODE.ACTIVE);
            this._bCardsWired = true;
            this._markCards(this._detail().getProperty("/listMode"));
        },

        // A card is a plain box, so mouse, Enter and Space are added here and it gets button semantics
        _makeClickable(oCard, fnHandler, sCardMode) {
            const applyA11y = () => {
                const oDom = oCard.getDomRef();
                if (oDom) {
                    oDom.setAttribute("tabindex", "0");
                    oDom.setAttribute("role", "button");
                    oDom.setAttribute("aria-pressed", String(this._detail().getProperty("/listMode") === sCardMode));
                }
            };
            oCard.addEventDelegate({
                ontap: () => fnHandler.call(this),
                onsapenter: () => fnHandler.call(this),
                onsapspace: (oEvent) => {
                    oEvent.preventDefault();
                    fnHandler.call(this);
                },
                onAfterRendering: applyA11y
            });
            applyA11y();
        },

        // ── EVENT HANDLERS ────────────────────────────────────────────

        onEnabledCardPress() {
            this._showEnabledList();
            this._scrollToList();
        },

        onActiveCardPress() {
            this._showActiveList(GRAIN.MONTHLY, this._sLatestMonthly);
            this._scrollToList();
        },

        async onGrainToggle(oEvent) {
            const iRoute = this._iRouteReq;
            this._sGrain = oEvent.getParameter("item").getKey();
            await this._loadTrendCounts(this._sGrain, iRoute);
            // The list follows the toggle only while it is showing an active period
            if (iRoute === this._iRouteReq && this._detail().getProperty("/listMode") === LIST_MODE.ACTIVE) {
                this._showActiveList(this._sGrain, this._latestPeriod());
            }
        },

        onTrendSelect(oEvent) {
            const aSelected = oEvent.getParameter("data") || [];
            const oPoint = aSelected.length ? aSelected[aSelected.length - 1].data : null;
            const sPeriod = oPoint && oPoint[CHART_PERIOD_DIMENSION];
            if (!sPeriod) {
                return;
            }
            this._showActiveList(this._sGrain, sPeriod);
            this._scrollToList();
        },

        onNavBack() {
            if (History.getInstance().getPreviousHash() !== undefined) {
                window.history.go(-1);
            } else {
                this.getAppComponent().getRouter().navTo(ROUTES.MAIN);
            }
        },

        onUserPress(oEvent) {
            const oRow = oEvent.getSource().getBindingContext(MODELS.USER_LIST).getObject();
            if (!oRow || !oRow.scimId) {
                return;
            }
            this.getAppComponent().getRouter().navTo(ROUTES.USER_DETAIL, {
                initiativeId: this._sInitiativeId,
                scimId: oRow.scimId
            });
        },

        // ── MESSAGES ──────────────────────────────────────────────────

        // Short message for the user, and the technical reason in the console
        _reportError(sKey, oError) {
            messages.report(this.getView(), sKey, oError);
        }
    });
});