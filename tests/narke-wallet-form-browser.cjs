const assert = require("node:assert/strict");

const luminance = color => {
  const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => {
    const channel = n / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
};
const contrast = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
};

module.exports = async ({call,evaluate,navigate,waitFor,screenshot,userId}) => {
  await navigate("/ajouter-compte-retrait");
  await waitFor("[...document.images].every(image=>image.complete&&image.naturalWidth>0)");
  for (const [id, value] of [["wallet-holder","Titulaire de test"],["wallet-number","90000000"]]) {
    await evaluate(`document.getElementById(${JSON.stringify(id)}).focus()`);
    await call("Input.insertText", {text: value});
    assert.equal(await evaluate(`document.getElementById(${JSON.stringify(id)}).value`),value);
  }
  for (const width of [320,390,768,1280]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:width<700?844:1024,deviceScaleFactor:1,mobile:width<700});
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),`Page overflow at ${width}px`);
    if(width<700) assert.equal(await evaluate("getComputedStyle(document.querySelector('.scene-index')).display"),"none",
      "The decorative signature must not overlap the mobile introduction");
    for (const id of ["wallet-holder","wallet-number"]) {
      for (const focused of [false,true]) {
        await evaluate(`document.getElementById(${JSON.stringify(id)}).${focused?"focus":"blur"}()`);
        const field=await evaluate(`(()=>{
          const field=document.getElementById(${JSON.stringify(id)});
          const style=getComputedStyle(field);
          const rect=field.getBoundingClientRect();
          return {color:style.color,fill:style.webkitTextFillColor,background:style.backgroundColor,
            caret:style.caretColor,opacity:style.opacity,font:parseFloat(style.fontSize),
            outline:style.outlineStyle,shadow:style.boxShadow,width:rect.width,type:field.type};
        })()`);
        assert(contrast(field.color,field.background)>=4.5,`${id}: unreadable ${focused?"focused":"idle"} text at ${width}px`);
        assert(contrast(field.fill,field.background)>=4.5,`${id}: unreadable Safari text fill`);
        assert(contrast(field.caret,field.background)>=3,`${id}: invisible insertion caret`);
        assert.equal(field.opacity,"1");
        assert(field.font>=16,`${id}: Safari focus must not zoom`);
        assert(field.width>180,`${id}: field is too narrow`);
        assert.equal(field.outline,"none");
        assert.equal(field.shadow,"none");
        assert.notEqual(field.type,"password");
      }
    }
    if(width===390) {
      await evaluate("document.getElementById('wallet-holder').focus()");
      await screenshot("narke-wallet-name-typing");
      await evaluate("document.getElementById('wallet-number').focus()");
      await screenshot("narke-wallet-number-typing");
    }
    if(width===1280) {
      await evaluate("document.activeElement.blur();window.scrollTo(0,0)");
      await screenshot("narke-wallet-desktop");
    }
  }
  await require("./wallet-operators-browser.cjs")({userId,call,evaluate,navigate,waitFor,screenshot});
  console.log("PASS: typed name and wallet number, focused/unfocused contrast and Safari text fill, readable caret, no focus halo or autozoom, four responsive sizes and six real wallet saves.");
};
