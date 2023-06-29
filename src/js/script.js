/** @jsx createElement */

function App(props) {
    const [text, setText] = useState(1);
    add = setText;

    return (
        <div>
          <h1>Hello {props.name} {text}</h1>
          {
            [1,2,3].map(el => 
                <Btn value={text} />
            )
          }
        </div> 
    )
}
const Btn = ({value}) => {
    const [testText, setTestText] = useState(value);
    useEffect(() => {
        console.log(1);

        return () => {
            console.log("return");
        }
    }, [testText])

    return (
        <button onClick={() => setTestText(testText => testText + 1)}>
            {testText}
        </button>
    )
}

const element = <App name="foso"></App>;
const element2 = <App name="foso2"></App>;
let add;
const container = document.getElementById("root");
const container2 = document.getElementById("root2");
render(element, container);
render(element2, container);