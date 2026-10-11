sap.ui.define(["./constants"], function (constants) {
    "use strict";

    const { GRAIN, ACTIVITY_STATUS } = constants;

    const MS_PER_DAY = 86400000;

    // How a period box looks for each status
    const CELL_STYLE = Object.freeze({
        [ACTIVITY_STATUS.ON]: { state: "Success", inverted: true },
        [ACTIVITY_STATUS.OFF]: { state: "None", inverted: true },
        [ACTIVITY_STATUS.PRE]: { state: "None", inverted: false }
    });

    // Monday (UTC) of an ISO week label such as "2026-W39", or null if it is not one
    function isoWeekStart(sLabel) {
        const aMatch = /^(\d{4})-W(\d{2})$/.exec(sLabel);
        if (!aMatch) {
            return null;
        }
        const iWeek = Number(aMatch[2]);
        const oJan4 = new Date(Date.UTC(Number(aMatch[1]), 0, 4));   // 4 January is always in week 1
        const iDayOfWeek = oJan4.getUTCDay() || 7;                    // Monday = 1 ... Sunday = 7
        return new Date(oJan4.getTime() + ((iWeek - 1) * 7 - (iDayOfWeek - 1)) * MS_PER_DAY);
    }

    // Which row a period belongs to (a month for weeks, a year for months) and the short text on its box.
    // aMonthNames are the 12 month names in the user's language, so this module needs no texts of its own.
    function describePeriod(sLabel, sGrain, aMonthNames) {
        if (sGrain === GRAIN.WEEKLY) {
            const oStart = isoWeekStart(sLabel);
            if (oStart) {
                const iMonth = oStart.getUTCMonth();
                const iYear = oStart.getUTCFullYear();
                return {
                    groupKey: iYear * 12 + iMonth,
                    groupTitle: `${aMonthNames[iMonth]} ${iYear}`,
                    text: sLabel.split("-")[1]                       // "2026-W39" -> "W39"
                };
            }
        } else {
            const aMatch = /^(\d{4})-(\d{2})$/.exec(sLabel);
            const iMonth = aMatch ? Number(aMatch[2]) : 0;
            if (iMonth >= 1 && iMonth <= 12) {
                return { groupKey: Number(aMatch[1]), groupTitle: aMatch[1], text: aMonthNames[iMonth - 1] };
            }
        }
        return { groupKey: sLabel, groupTitle: sLabel, text: sLabel };   // not a label we know: shown as it is
    }

    // Builds what the user page shows for one grain.
    //   labels: all known period labels, oldest first
    //   mine:   { label: { firstSeen, lastSeen } } for the periods this person was active
    //   texts:  { pre, none } tooltip texts
    // Streaks and consistency are counted from the first active period to the latest known period.
    function buildActivity({ labels, mine, monthNames, grain, texts }) {
        const iFirst = labels.findIndex((sLabel) => mine[sLabel]);

        let iActive = 0;
        let iLongest = 0;
        let iRun = 0;
        if (iFirst >= 0) {
            labels.slice(iFirst).forEach((sLabel) => {
                if (mine[sLabel]) {
                    iActive++;
                    iRun++;
                    iLongest = Math.max(iLongest, iRun);
                } else {
                    iRun = 0;
                }
            });
        }
        const iSince = iFirst >= 0 ? labels.length - iFirst : 0;

        const aGroups = [];
        const mGroupIndex = new Map();
        labels.forEach((sLabel, i) => {
            const oInfo = describePeriod(sLabel, grain, monthNames);
            const oRow = mine[sLabel];
            const sStatus = oRow
                ? ACTIVITY_STATUS.ON
                : (iFirst >= 0 && i < iFirst ? ACTIVITY_STATUS.PRE : ACTIVITY_STATUS.OFF);
            const sTipText = oRow
                ? `${oRow.firstSeen} – ${oRow.lastSeen}`
                : (sStatus === ACTIVITY_STATUS.PRE ? texts.pre : texts.none);

            if (!mGroupIndex.has(oInfo.groupKey)) {
                mGroupIndex.set(oInfo.groupKey, aGroups.length);
                aGroups.push({ title: oInfo.groupTitle, cells: [] });
            }
            aGroups[mGroupIndex.get(oInfo.groupKey)].cells.push({
                label: oInfo.text,
                tip: `${sLabel}: ${sTipText}`,
                state: CELL_STYLE[sStatus].state,
                inverted: CELL_STYLE[sStatus].inverted
            });
        });

        return {
            stats: {
                currentStreak: iRun,               // the run that ends at the latest period
                longestStreak: iLongest,
                activePeriods: iActive,
                periodsSinceFirst: iSince,
                consistencyPct: iSince ? Math.round((iActive / iSince) * 100) : 0
            },
            groups: aGroups
        };
    }

    return { isoWeekStart, describePeriod, buildActivity };
});