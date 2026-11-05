// Every scenario, step, BI event and logger name the lab uses, declared as the
// README tells applications to, so the library's types check them.
declare module '@absaoss-cps/ngx-ui-watchtower' {
  interface UwtScenarioNames {
    'lab-happy-path': true;
    'lab-failure': true;
    'lab-cancel': true;
    'lab-incomplete': true;
    'lab-timeout': true;
    'lab-backdated': true;
    'lab-aggregates': true;
    'lab-http': true;
    'lab-http-error': true;
    'lab-superseded': true;
    'lab-abandoned': true;
    'lab-privacy': true;
    'lab-burst': true;
  }
  interface UwtScenarioSteps {
    fetch: true;
    validate: true;
    render: true;
    batch: true;
  }
  interface UwtBIEventNames {
    lab_button_clicked: true;
    lab_double_fired: true;
    lab_feature_used: true;
    lab_privacy_checked: true;
    lab_burst: true;
  }
  interface UwtLoggerNames {
    lab: true;
    noisy: true;
    privacy: true;
  }
}

export {};
