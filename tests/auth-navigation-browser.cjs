const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot }) => {
  await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const tap = async selector => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center"})`);
    const point = await evaluate(`(() => {
      const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return {x:box.left+box.width/2,y:box.top+box.height/2};
    })()`);
    await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await waitFor("location.pathname==='/connexion' && document.readyState==='complete' && document.querySelector('#login-form')");
  };
  for (const width of [320, 390, 472]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width, height: 844, deviceScaleFactor: 1, mobile: true,
    });
    await navigate("/inscription");
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"), `No overflow at ${width}px`);
    assert(await evaluate(`(() => {
      const question=document.querySelector(".auth-switch-question");
      return question.tagName==="A" && question.getAttribute("href")==="/connexion"
        && question.getBoundingClientRect().height>=44;
    })()`), "The circled question must be a native, touch-sized login link");
    if (width === 390) {
      await evaluate('document.querySelector(".signup-footer").scrollIntoView({block:"center"})');
      await screenshot("signup-login-question-link");
    }
    // Real touch navigation must work even with every registration field empty.
    await tap(".auth-switch-question");
    await navigate("/inscription");
    await tap(".signup-footer a:not(.auth-switch-question)");
  }
  await navigate("/inscription");
  await evaluate('document.querySelector(".auth-switch-question").focus()');
  assert(await evaluate('document.activeElement.matches(".auth-switch-question")'));
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await waitFor("location.pathname==='/connexion' && document.readyState==='complete'");
  console.log("PASS: circled signup question and blue button navigate to login by touch at 320/390/472px; keyboard Enter works without submitting the signup form.");
};
