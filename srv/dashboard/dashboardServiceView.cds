// srv/dashboard/dashboardServiceAnnotations.cds

using DashboardService from './dashboardService';


// ─────────────────────────────────────────────────────────────────────────────
// FIELD TITLES — Initiatives entity
// ─────────────────────────────────────────────────────────────────────────────
annotate DashboardService.Initiatives with {
    name             @title : '{i18n>initiative_name}';
    owner            @title : '{i18n>initiative_owner}';
    status           @title : '{i18n>initiative_status}';
    launchDate       @title : '{i18n>initiative_launchDate}';
    enabledUsers     @title : '{i18n>initiative_enabledUsers}';
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 1 — Initiatives List Report
// Filter bar: All / Live / Coming Soon
// Columns: Initiative | Status (badge) | Owner | Enabled Users | Launch Date
// ─────────────────────────────────────────────────────────────────────────────
annotate DashboardService.Initiatives with @(

    UI.HeaderInfo : {
        TypeName       : '{i18n>initiative_typeName}',
        TypeNamePlural : '{i18n>initiative_typeNamePlural}',
        Title          : { $Type : 'UI.DataField', Value : name },
        Description    : { $Type : 'UI.DataField', Value : owner }
    },

    // Status chip filter bar — All / Live / Coming Soon
    UI.SelectionFields : [ status ],

    // List Report table columns
    UI.LineItem : [
        {
            $Type             : 'UI.DataField',
            Value             : name,
            Label             : '{i18n>initiative_name}',
            ![@UI.Importance] : #High
        },
        {
            // Status badge — Live → Green (3), ComingSoon → Neutral (0)
            // Criticality references virtual Integer field statusCriticality
            // computed in @AfterRead handler in dashboard-service.js
            $Type                     : 'UI.DataField',
            Value                     : status,
            Label                     : '{i18n>initiative_status}',
            Criticality               : statusCriticality,
            CriticalityRepresentation : #WithoutIcon,
            ![@UI.Importance]         : #High
        },
        {
            $Type             : 'UI.DataField',
            Value             : owner,
            Label             : '{i18n>initiative_owner}',
            ![@UI.Importance] : #Medium
        },
        {
            // enabledUsers — virtual field, count of active:true Person rows
            // populated in @AfterRead handler, sourced from SCIM nightly sync
            // DashboardAdmin only — shown per dashboard spec *`[1]`*
            $Type             : 'UI.DataField',
            Value             : enabledUsers,
            Label             : '{i18n>initiative_enabledUsers}',
            ![@UI.Importance] : #High
        },
        {
            $Type             : 'UI.DataField',
            Value             : launchDate,
            Label             : '{i18n>initiative_launchDate}',
            ![@UI.Importance] : #Medium
        }
    ]
);