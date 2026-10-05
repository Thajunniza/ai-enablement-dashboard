sap.ui.define(
    [
        "sap/fe/core/PageController",
        "sap/ui/core/UIComponent"
    ],
    function (PageController, UIComponent) {
        "use strict";

        return PageController.extend(
            "com.sap.aiinitiativesoverview.ext.view.Main", {

            onInit: function () {
                PageController.prototype.onInit.apply(this, arguments);
                this.oView   = this.getView();
                this.oRouter = this.getAppComponent().getRouter();
            },

            onSelectProduct: function (oEvent) {
                var oSource = oEvent.getSource();
                var oCtx    = oSource.getBindingContext()
                           || oSource.getParent().getBindingContext();

                if (!oCtx) {
                    return;
                }

                this.oRouter.navTo("InitiativeDetail", {
                    initiativeId: encodeURIComponent(oCtx.getProperty("ID"))
                });
            }

        });
    }
);