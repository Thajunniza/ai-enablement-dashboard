sap.ui.define([
    "sap/m/MessageToast",
    "sap/base/Log",
    "./constants"
], function (MessageToast, Log, constants) {
    "use strict";

    const { MODELS, LOG_COMPONENT } = constants;

    // Text from the i18n file. Falls back to the key if the file is not loaded yet.
    function getText(oView, sKey, aArgs) {
        const vBundle = oView.getModel(MODELS.I18N).getResourceBundle();
        return typeof vBundle.then === "function" ? sKey : vBundle.getText(sKey, aArgs);
    }

    // Short message for the user
    function show(oView, sKey, aArgs) {
        MessageToast.show(getText(oView, sKey, aArgs));
    }

    // Short message for the user, and the technical reason in the console
    function report(oView, sKey, oError) {
        Log.error(getText(oView, sKey), oError && oError.message, LOG_COMPONENT);
        MessageToast.show(getText(oView, sKey));
    }

    return { getText, show, report };
});