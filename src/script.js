/** @jsx createElement */

function App(props) {
  const [text, setText] = useState(1);
  add = setText;
  return createElement("div", null, createElement("h1", null, "Hello ", props.name, " ", text), [1, 2, 3].map(el => createElement(Btn, {
    value: text
  })));
}
const Btn = ({
  value
}) => {
  const [testText, setTestText] = useState(value);
  useEffect(() => {
    console.log(1);
    return () => {
      console.log("return");
    };
  }, [testText]);
  return createElement("button", {
    onClick: () => setTestText(testText => testText + 1)
  }, testText);
};
const element = createElement(App, {
  name: "foso"
});
const element2 = createElement(App, {
  name: "foso2"
});
let add;
const container = document.getElementById("root");
const container2 = document.getElementById("root2");
render(element, container);
render(element2, container);
