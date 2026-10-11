sap.ui.define(["./constants"], function (constants) {
    "use strict";

    const { MAX_LIST_ROWS } = constants;

    // Reading from the dashboard service, shared by the page controllers.
    // Every binding created here is destroyed again, also when the request fails.

    // Reads up to MAX_LIST_ROWS rows and maps each one with fnMap
    async function requestRows(oModel, sPath, aFilters, mParameters, fnMap) {
        const oBinding = oModel.bindList(sPath, null, [], aFilters, mParameters);
        try {
            const aContexts = await oBinding.requestContexts(0, MAX_LIST_ROWS);
            return aContexts.map((oContext) => fnMap(oContext.getObject()));
        } finally {
            oBinding.destroy();
        }
    }

    // Asks the server for the number of matching rows
    async function countRows(oModel, sPath, aFilters) {
        const oBinding = oModel.bindList(sPath, null, [], aFilters, { $count: true });
        try {
            await oBinding.requestContexts(0, 1);
            const iCount = oBinding.getLength();
            if (!Number.isInteger(iCount)) {
                throw new Error(`The service returned no count for ${sPath}`);
            }
            return iCount;
        } finally {
            oBinding.destroy();
        }
    }

    // Calls a function of the service and returns its result
    async function callFunction(oModel, sPath, mParameters) {
        const oBinding = oModel.bindContext(sPath);
        try {
            Object.entries(mParameters).forEach(([sName, vValue]) => oBinding.setParameter(sName, vValue));
            await oBinding.invoke();
            return oBinding.getBoundContext().getObject();
        } finally {
            oBinding.destroy();
        }
    }

    return { requestRows, countRows, callFunction };
});