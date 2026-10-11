sap.ui.define([], function () {
    "use strict";

    // Fixed values used by the UI. Nothing here is a secret.
    // Where a value is shared with the CAP side it says so; the UI cannot import
    // srv/shared/constants.js, so change both together.
    return Object.freeze({
        // Mirrors STATUS in srv/shared/constants.js
        STATUS: Object.freeze({
            LIVE: "Live",
            COMING_SOON: "ComingSoon",
            INACTIVE: "Inactive"
        }),

        // Mirrors GRAINS in srv/usage-jobs/lib/roster.js (the service rejects anything else)
        GRAIN: Object.freeze({
            WEEKLY: "WEEKLY",
            MONTHLY: "MONTHLY",
            YEARLY: "YEARLY"
        }),
        DEFAULT_GRAIN: "MONTHLY",

        // Route names: must match the routes in manifest.json
        ROUTES: Object.freeze({
            MAIN: "InitiativesMain",
            INITIATIVE_DETAIL: "InitiativeDetail",
            USER_DETAIL: "UserDetail"
        }),

        // Model names: must match the names used in the views
        MODELS: Object.freeze({
            I18N: "i18n",
            DETAIL: "detailModel",
            TREND: "trendModel",
            USER_LIST: "userListModel",
            USER: "userModel",
            ACTIVITY: "activityModel"
        }),

        // Status of one period box in the activity strip on the user page
        ACTIVITY_STATUS: Object.freeze({
            ON: "on",          // the person was active in this period
            OFF: "off",        // no activity
            PRE: "pre"         // before the person's first active period
        }),

        // Which user list the detail page shows
        LIST_MODE: Object.freeze({
            ENABLED: "ENABLED",
            ACTIVE: "ACTIVE"
        }),

        // OData paths of the dashboard service (see srv/dashboard/dashboardService.cds)
        ODATA: Object.freeze({
            INITIATIVES: "/Initiatives",
            PERSONS: "/Persons",
            ACTIVE_USERS: "/ActiveUsers",
            FN_ENABLED_COUNT: "/getEnabledUserCount(...)",
            FN_TREND: "/getTrendCounts(...)"
        }),

        // The user lists read at most this many rows; a note is shown when the limit is reached
        MAX_LIST_ROWS: 500,

        // An initiative id from the URL is put into an OData path, so only these characters are allowed
        SAFE_ID_PATTERN: /^[0-9A-Za-z-]+$/,

        // Name of the chart dimension in Detail.view.xml (the selected point is read by this name)
        CHART_PERIOD_DIMENSION: "Period",

        // CSS class that marks the selected KPI card
        SELECTED_CARD_CLASS: "aiedKpiCardSelected",

        // Component name for log messages
        LOG_COMPONENT: "ai.enablement.dashboard.ui",

        // Colours of the status badge on an initiative card
        INDICATION: Object.freeze({
            LIVE: "Indication16",
            OTHER: "Indication13"
        }),

        // Prefix of the i18n keys that hold the status texts, e.g. status_Live
        STATUS_TEXT_PREFIX: "status_"
    });
});