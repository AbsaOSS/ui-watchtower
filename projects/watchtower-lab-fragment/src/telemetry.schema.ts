// Every scenario, step, BI event and logger name the fragment uses.
declare module '@absaoss-cps/ngx-ui-watchtower' {
  interface UwtScenarioNames {
    'fragment-journey': true;
  }
  interface UwtScenarioSteps {
    fetch: true;
    render: true;
  }
  interface UwtBIEventNames {
    fragment_button_clicked: true;
  }
  interface UwtLoggerNames {
    fragment: true;
  }
}

export {};
