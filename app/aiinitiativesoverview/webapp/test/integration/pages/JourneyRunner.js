sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"com/sap/aiinitiativesoverview/test/integration/pages/InitiativesMain.gen"
], function (JourneyRunner, InitiativesMainGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('com/sap/aiinitiativesoverview') + '/test/flp.html#app-preview',
        pages: {
			onTheInitiativesMainGenerated: InitiativesMainGenerated
        },
        async: true
    });

    return runner;
});

