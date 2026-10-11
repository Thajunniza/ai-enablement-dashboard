sap.ui.define(["./constants"], function (constants) {
    "use strict";

    const { STATUS, INDICATION, STATUS_TEXT_PREFIX } = constants;

    // Small functions the views use in their bindings, e.g.
    //   visible="{path: 'status', formatter: '.formatter.isLive'}"
    // The controller exposes this object as `formatter`.
    return {
        // Only Live initiatives have data to show and a detail page to open
        isLive(sStatus) {
            return sStatus === STATUS.LIVE;
        },

        statusState(sStatus) {
            return sStatus === STATUS.LIVE ? INDICATION.LIVE : INDICATION.OTHER;
        },

        // Translated status name. Falls back to the raw value if the text is missing.
        // `this` is the controller when the formatter is used from a view.
        statusText(sStatus) {
            if (!sStatus) {
                return "";
            }
            const vBundle = this.getView().getModel("i18n").getResourceBundle();
            if (typeof vBundle.then === "function") {
                return sStatus;   // bundle not loaded yet
            }
            const sKey = STATUS_TEXT_PREFIX + sStatus;
            return vBundle.hasText(sKey) ? vBundle.getText(sKey) : sStatus;
        }
    };
});