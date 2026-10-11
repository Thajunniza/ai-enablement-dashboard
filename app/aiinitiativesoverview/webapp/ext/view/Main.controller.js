sap.ui.define(
    [
        "sap/fe/core/PageController",
        "../util/constants",
        "../util/formatter"
    ],
    function (PageController, constants, formatter) {
        "use strict";

        const { ROUTES } = constants;

        return PageController.extend("com.sap.aiinitiativesoverview.ext.view.Main", {

            // Used in the view as .formatter.<name>
            formatter,

            // Opens the detail page of the initiative on the clicked card.
            // Only Live initiatives have a detail page, so the others are ignored.
            onSelectProduct(oEvent) {
                const oContext = oEvent.getSource().getBindingContext();

                if (!oContext || !formatter.isLive(oContext.getProperty("status"))) {
                    return;
                }

                this.getAppComponent().getRouter().navTo(ROUTES.INITIATIVE_DETAIL, {
                    initiativeId: oContext.getProperty("ID")
                });
            },

            // Filter bar (phase 2): the controls are in the view, the logic is not written yet.
            // These placeholders keep the view free of "handler not found" errors until then.
            onSearchInitiatives() {
                // TODO phase 2: filter the initiatives by name
            },

            onStatusFilterChange() {
                // TODO phase 2: filter by the selected status (read the key from the item's customData)
            },

            onOwnerFilterChange() {
                // TODO phase 2: filter by owner, and fill the owner list
            },

            onQuickFilterToggle() {
                // TODO phase 2: "has enabled users" needs a service change, see the review notes
            }
        });
    }
);