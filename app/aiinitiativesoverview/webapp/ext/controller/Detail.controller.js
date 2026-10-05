sap.ui.define([
    "sap/fe/core/PageController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/ui/core/routing/History"
], function (PageController, JSONModel, Filter, FilterOperator, MessageToast, History) {
    "use strict";

    var ENABLED = "ENABLED";
    var ACTIVE = "ACTIVE";
    var SELECTED_CLASS = "aiedKpiCardSelected";

    return PageController.extend("com.sap.aiinitiativesoverview.ext.controller.Detail", {

        onInit: function () {
            PageController.prototype.onInit.apply(this, arguments);

            this._sInitiativeId = null;
            this._sGrain = "MONTHLY";
            this._sLatestMonthly = "";
            this._iListReq = 0;          // guards against out-of-order list responses
            this._iDeselectTimer = null;
            this._bCardsWired = false;

            this.oRouter = this.getAppComponent().getRouter();
            this.oRouter
                .getRoute("InitiativeDetail")
                .attachPatternMatched(this._onRouteMatched, this);

            this.getView().setModel(new JSONModel({
                name: "",
                status: "",
                statusCriticality: 0,
                owner: "",
                launchDate: "",
                iasGroup: "",
                enabledUsersCount: 0,
                activeUsersCount: 0,
                maskingNote: "",
                listMode: ENABLED,       // ENABLED | ACTIVE
                listPeriod: "",          // period label shown in the list subtitle
                listCount: 0,
                listBusy: false
            }), "detailModel");

            this.getView().setModel(new JSONModel({ results: [] }), "trendModel");
            this.getView().setModel(new JSONModel([]), "userListModel");

            // Wire the KPI cards once the view has rendered
            this.getView().addEventDelegate({ onAfterRendering: this._wireCards }, this);
        },

        _onRouteMatched: function (oEvent) {
            var that = this;
            this._sInitiativeId = oEvent.getParameter("arguments").initiativeId;
            this._sGrain = "MONTHLY";
            this._sLatestMonthly = "";

            var oToggle = this.byId("grainToggle");
            if (oToggle) { oToggle.setSelectedKey("MONTHLY"); }

            this._detail().setProperty("/activeUsersCount", 0);
            this.getView().getModel("userListModel").setData([]);

            this._loadInitiative(this._sInitiativeId);
            this._loadEnabledUserCount(this._sInitiativeId);
            this._setMaskingNote();
            this._showEnabledList();     // default list
            this._wireCards();

            // Trend first (gives the latest monthly period), then the scoped Active users KPI
            this._loadTrendCounts("MONTHLY").then(function (aResults) {
                that._sLatestMonthly = aResults.length ? aResults[aResults.length - 1].periodLabel : "";
                if (!that._sLatestMonthly) { return null; }
                return that._fetchActiveRoster("MONTHLY", that._sLatestMonthly).then(function (aRows) {
                    that._detail().setProperty("/activeUsersCount", aRows.length);
                });
            }).catch(function () {
                MessageToast.show("Failed to load active users");
            });
        },

        // ── DATA LOADING ──────────────────────────────────────────────

        _loadInitiative: function (sId) {
            var oDetailModel = this._detail();
            this.getView().getModel().bindContext("/Initiatives(" + sId + ")")
                .requestObject()
                .then(function (oData) {
                    oDetailModel.setProperty("/name", oData.name || "");
                    oDetailModel.setProperty("/status", oData.status || "");
                    oDetailModel.setProperty("/statusCriticality", oData.statusCriticality || 0);
                    oDetailModel.setProperty("/owner", oData.owner || "");
                    oDetailModel.setProperty("/launchDate", oData.launchDate || "");
                    oDetailModel.setProperty("/iasGroup", oData.iasGroup || "");
                })
                .catch(function () {
                    MessageToast.show("Failed to load initiative details");
                });
        },

        _loadEnabledUserCount: function (sId) {
            var oDetailModel = this._detail();
            var oFunctionContext = this.getView().getModel().bindContext("/getEnabledUserCount(...)");
            oFunctionContext.setParameter("initiativeId", sId);
            oFunctionContext.invoke()
                .then(function () {
                    var oResult = oFunctionContext.getBoundContext().getObject();
                    oDetailModel.setProperty("/enabledUsersCount", oResult.count || 0);
                })
                .catch(function () {
                    MessageToast.show("Failed to load enabled user count");
                });
        },

        // Resolves with the trend array (never rejects)
        _loadTrendCounts: function (sGrain) {
            var oTrendModel = this.getView().getModel("trendModel");
            var oFunctionContext = this.getView().getModel().bindContext("/getTrendCounts(...)");
            oFunctionContext.setParameter("grain", sGrain);
            return oFunctionContext.invoke()
                .then(function () {
                    var aResults = (oFunctionContext.getBoundContext().getObject().value || [])
                        .map(function (o) {
                            return { periodLabel: o.periodLabel, activeCount: o.activeCount };
                        });
                    oTrendModel.setProperty("/results", aResults);
                    return aResults;
                })
                .catch(function () {
                    MessageToast.show("Failed to load trend data");
                    oTrendModel.setProperty("/results", []);
                    return [];
                });
        },

        // Generic list read -> mapped plain rows
        _requestRows: function (sPath, aFilters, mParameters, fnMap) {
            var oBinding = this.getView().getModel().bindList(sPath, null, [], aFilters, mParameters);
            return oBinding.requestContexts(0, 500).then(function (aContexts) {
                var aRows = aContexts.map(function (oContext) { return fnMap(oContext.getObject()); });
                oBinding.destroy();
                return aRows;
            });
        },

        _personName: function (o) {
            return o.displayName || [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || "";
        },

        _fetchEnabledPersons: function () {
            var that = this;
            return this._requestRows(
                "/Persons",
                [new Filter("initiative_ID", FilterOperator.EQ, this._sInitiativeId)],
                undefined,
                function (o) {
                    return { name: that._personName(o), email: o.email, active: !!o.active };
                }
            );
        },

        _fetchActiveRoster: function (sGrain, sPeriod) {
            var that = this;
            return this._requestRows(
                "/ActiveUsers",
                [
                    new Filter("grain", FilterOperator.EQ, sGrain),
                    new Filter("periodLabel", FilterOperator.EQ, sPeriod),
                    new Filter("person/initiative_ID", FilterOperator.EQ, this._sInitiativeId)
                ],
                { $expand: "person" },
                function (o) {
                    var p = o.person || {};
                    return {
                        name: that._personName(p),
                        email: p.email,
                        firstSeen: o.firstSeen,
                        lastSeen: o.lastSeen
                    };
                }
            );
        },

        // ── LIST SWITCHING ────────────────────────────────────────────

        _showEnabledList: function () {
            var that = this;
            var iReq = ++this._iListReq;
            this._setMode(ENABLED, "");
            this._setBusy(true);
            return this._fetchEnabledPersons()
                .then(function (aRows) {
                    if (iReq === that._iListReq) { that._applyRows(aRows); }
                })
                .catch(function () {
                    if (iReq === that._iListReq) {
                        that._applyRows([]);
                        MessageToast.show("Failed to load enabled users");
                    }
                });
        },

        _showActiveList: function (sGrain, sPeriod) {
            var that = this;
            var iReq = ++this._iListReq;
            this._setMode(ACTIVE, sPeriod || "");
            if (!sPeriod) {
                this._applyRows([]);
                return Promise.resolve();
            }
            this._setBusy(true);
            return this._fetchActiveRoster(sGrain, sPeriod)
                .then(function (aRows) {
                    if (iReq === that._iListReq) { that._applyRows(aRows); }
                })
                .catch(function () {
                    if (iReq === that._iListReq) {
                        that._applyRows([]);
                        MessageToast.show("Failed to load active users");
                    }
                });
        },

        _applyRows: function (aRows) {
            this.getView().getModel("userListModel").setData(aRows);
            this._detail().setProperty("/listCount", aRows.length);
            this._setBusy(false);
        },

        _setMode: function (sMode, sPeriod) {
            this._detail().setProperty("/listMode", sMode);
            this._detail().setProperty("/listPeriod", sPeriod);
            this._markCard(sMode);
        },

        _setBusy: function (bBusy) {
            this._detail().setProperty("/listBusy", bBusy);
        },

        _markCard: function (sMode) {
            var oEnabled = this.byId("enabledUsersKpi");
            var oActive = this.byId("activeUsersKpi");
            if (oEnabled) { oEnabled.toggleStyleClass(SELECTED_CLASS, sMode === ENABLED); }
            if (oActive) { oActive.toggleStyleClass(SELECTED_CLASS, sMode === ACTIVE); }
        },

        _latestPeriod: function () {
            var aResults = this.getView().getModel("trendModel").getProperty("/results") || [];
            return aResults.length ? aResults[aResults.length - 1].periodLabel : "";
        },

        _scrollToList: function () {
            var oSection = this.byId("userListSection");
            var oDom = oSection && oSection.getDomRef();
            if (oDom && oDom.scrollIntoView) {
                oDom.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        },

        // ── KPI CARD CLICK WIRING ─────────────────────────────────────

        _wireCards: function () {
            if (this._bCardsWired) { return; }
            var oEnabled = this.byId("enabledUsersKpi");
            var oActive = this.byId("activeUsersKpi");
            if (!oEnabled || !oActive) { return; }   // not created yet; retried on next render / route match

            this._makeClickable(oEnabled, this.onEnabledCardPress);
            this._makeClickable(oActive, this.onActiveCardPress);
            this._bCardsWired = true;
            this._markCard(this._detail().getProperty("/listMode"));
        },

        _makeClickable: function (oCard, fnHandler) {
            var that = this;
            var applyA11y = function () {
                var oDom = oCard.getDomRef();
                if (oDom) {
                    oDom.setAttribute("tabindex", "0");
                    oDom.setAttribute("role", "button");
                }
            };
            oCard.addEventDelegate({
                ontap: function () { fnHandler.call(that); },
                onsapenter: function () { fnHandler.call(that); },
                onsapspace: function (oEvt) { oEvt.preventDefault(); fnHandler.call(that); },
                onAfterRendering: applyA11y
            });
            applyA11y();
        },

        // ── EVENT HANDLERS ────────────────────────────────────────────

        onEnabledCardPress: function () {
            this._showEnabledList();
            this._scrollToList();
        },

        onActiveCardPress: function () {
            this._showActiveList("MONTHLY", this._sLatestMonthly);
            this._scrollToList();
        },

        onGrainToggle: function (oEvent) {
            var that = this;
            this._sGrain = oEvent.getParameter("item").getKey();
            this._loadTrendCounts(this._sGrain).then(function () {
                // Only follow the toggle if the list is currently showing a chart/active period
                if (that._detail().getProperty("/listMode") === ACTIVE) {
                    that._showActiveList(that._sGrain, that._latestPeriod());
                }
            });
        },

        onTrendSelect: function (oEvent) {
            clearTimeout(this._iDeselectTimer);
            var aSelected = oEvent.getParameter("data") || [];
            var oPoint = aSelected.length ? aSelected[aSelected.length - 1].data : null;
            var sPeriod = oPoint && oPoint.Period;
            if (!sPeriod) { return; }
            this._showActiveList(this._sGrain, sPeriod);
            this._scrollToList();
        },

        onTrendDeselect: function () {
            var that = this;
            clearTimeout(this._iDeselectTimer);
            // Replacing one selection with another fires deselect then select;
            // wait briefly so the follow-up select can cancel this.
            this._iDeselectTimer = setTimeout(function () {
                that._showActiveList(that._sGrain, that._latestPeriod());
            }, 150);
        },

        onNavBack: function () {
            var sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.oRouter.navTo("InitiativesMain");
            }
        },
        _detail: function () {
            return this.getView().getModel("detailModel");
        }
    });
});