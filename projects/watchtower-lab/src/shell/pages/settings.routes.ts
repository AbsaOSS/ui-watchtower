import { Routes } from '@angular/router';
import { LAB_SETTINGS_SECTIONS } from '../../lab/lab-settings-fields';
import { SettingsOverviewPage } from './settings-overview.page';
import { SettingsSectionPage } from './settings-section.page';
import { SettingsPage } from './settings.page';

/** Settings: its overview, and a page for each section, around what they share. */
export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    component: SettingsPage,
    children: [
      {
        path: '',
        title: 'Settings · Watchtower Lab',
        component: SettingsOverviewPage
      },
      ...LAB_SETTINGS_SECTIONS.map((section) => ({
        path: section.path,
        title: `${section.label} · Settings · Watchtower Lab`,
        component: SettingsSectionPage,
        data: { section }
      }))
    ]
  }
];
