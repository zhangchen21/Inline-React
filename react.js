
const {
	createElement,
	render,
	useState,
	useEffect,
} = (() => {
	function createElement(type, props, ...children) {
		return {
			type,
			props: {
				...props,
				// This is always an array
				children: children.flat().map(child => typeof child === 'object' ? child : createTextElement(child))
			}
		}
	}
	
	function createTextElement(text) {
		return {
			type: "TEXT_ELEMENT",
			props: {
				nodeValue: text,
				// Maintain consistency
				children: []
			}
		}
	}
	
	function render(element, container) {
		// Set container as first unit of work
		workInProgressRoot = {
			dom: container,
			props: {
				children: [element]
			},
			alternate: currentRoot,
		}
		deletions = [];
		nextUnitOfWork = workInProgressRoot;

		requestIdleCallback(workLoop);
	}
	
	/*****************  Follows are for concurrent mode  ************/
	let nextUnitOfWork = null;
	let workInProgressRoot = null;
	let currentRoot = null;
	let deletions = null;
	let workInProgressFiber = null;
	let hookIndex = null;
	const EffectTags = {
		UPDATE: "UPDATE",
		PLACEMENT: "PLACEMENT",
		DELETION: "DELETION",
	}
	
	function workLoop(deadline) {
		let shouldYield = false;

		while(nextUnitOfWork && !shouldYield) {
			nextUnitOfWork = performUnitOfWork(nextUnitOfWork);

			shouldYield = deadline.timeRemaining() < 1;
		}

		// We do this to avoid append child to real Dom before work is really finished
		if (!nextUnitOfWork && workInProgressRoot) {
			commitRoot();
		}

		// This will run when browser is free, and cause we store nextUnitOfWork, we can run workLoop from that
		// This is equal with React's schedual
		requestIdleCallback(workLoop);
	}
	
	/*****************  To do concurrent mode, we need to define and process unitOfWork, which is called fiber  *************/
	// We are going to append dom of this fiber to window, and then try to get next fiber
	function performUnitOfWork(fiber) {
		// Deal with dom
		const isFunctionComponent = fiber.type instanceof Function;

		// Try to find next unit of work, which is next fiber
		// Firstly, we're going to create fiber for children, function component is different           
		isFunctionComponent ? updateFunctionComponent(fiber) : updateHostComponent(fiber);

		// Secondly, return next fiber by order: child -> sibling -> uncle
		if (fiber.child) {
			return fiber.child;
		}
		let nextFiber = fiber;
		while(nextFiber) {
			if (nextFiber.sibling) {
				return nextFiber.sibling
			}
			// Recall until #root
			nextFiber = nextFiber.parent;
		}      
	}
	
	function updateFunctionComponent(fiber) {
		workInProgressFiber = fiber;
		hookIndex = 0;
		workInProgressFiber.hooks = [];

		// From fiber.type we can get the function component
		const children = [fiber.type(fiber.props)];
		reconcileChildren(fiber, children);
	}
	
	function updateHostComponent(fiber) {
		fiber.dom = fiber.dom ?? createDom(fiber);

		reconcileChildren(fiber, fiber.props.children);
	}
	
	function reconcileChildren(fiber, children) {
		let oldFiber = fiber.alternate?.child;
	
		children.reduce((prev, current, index) => {
			let newFiber = null;

			const Reusable = current && oldFiber && current.type == oldFiber.type;
			if (Reusable) {
				newFiber = {
					type: oldFiber.type,
					props: current.props,
					dom: oldFiber.dom,
					parent: fiber,
					alternate: oldFiber,
					effectTag: EffectTags.UPDATE,
				}
			}
			// We need to do some remove and create things
			if (current && !Reusable) {
				newFiber = {
					type: current.type,
					props: current.props,
					dom: null,
					parent: fiber,
					alternate: null,
					effectTag: EffectTags.PLACEMENT,
				}
			}
			if (oldFiber && !Reusable) {
				oldFiber.effectTag = EffectTags.DELETION
				deletions.push(oldFiber)
			}

			if (oldFiber) {
				oldFiber = oldFiber.sibling
			}

			if (index === 0) {
				fiber.child = newFiber;
			} else {
				prev.sibling = newFiber;
			}

			return newFiber;
		// Add null as second param to make sure reduce from first child
		}, null)
		
		// Left oldFibers need to be deleted
		while(oldFiber) {
			oldFiber.effectTag = EffectTags.DELETION;
			deletions.push(oldFiber);

			oldFiber = oldFiber.sibling;
		}
	}
	
	function createDom(fiber) {
		const node =  
			fiber.type == "TEXT_ELEMENT"
			? document.createTextNode("")
			: document.createElement(fiber.type);

		// Add props
		const isEvent = key => key.startsWith("on");
		const isProperty = key => key !== "children" && !isEvent(key);
		const getEventName = (name) => name.toLowerCase().substring(2);

		Object.keys(fiber.props)
		.filter(key => isProperty(key))
		.forEach(key => node[key] = fiber.props[key])

		// Add event listeners
		Object.keys(fiber.props)
		.filter(isEvent)
		.forEach(name => {
			node.addEventListener(
				getEventName(name),
				fiber.props[name]
			)
		})			

		
		return node;
	}
	
	function commitRoot() {
		// Don't forget delete
		deletions.forEach(commitWork);
		commitWork(workInProgressRoot.child);
		// Clean workInProgressRoot
		currentRoot = workInProgressRoot;
		workInProgressRoot = null;
	}
	
	function commitWork(fiber) {
		if (!fiber) {
			return;
		}

		let domParentFiber = fiber.parent;
		while (!domParentFiber.dom) {
			domParentFiber = domParentFiber.parent;
		}
		const domParent = domParentFiber.dom;

		if (fiber.effectTag === EffectTags.PLACEMENT) {
			fiber.dom != null && domParent.appendChild(fiber.dom);

			runEffect(fiber);
		} else if (fiber.effectTag === EffectTags.DELETION) {
			cancelEffect(fiber);

			commitDeletion(fiber, domParent);
			return;
		} else if (fiber.effectTag === EffectTags.UPDATE) {
			cancelEffect(fiber);

			fiber.dom != null && updateDom(
				fiber.dom,
				fiber.alternate.props,
				fiber.props
			)

			runEffect(fiber);
		}
	
		commitWork(fiber.child);
		commitWork(fiber.sibling);
	}
	
	function commitDeletion(fiber, domParent) {
		if (fiber.dom) {
			domParent.removeChild(fiber.dom)
		} else {
			commitDeletion(fiber.child, domParent)
		}
	}
	
	// Famous diff algo
	function updateDom(dom, prevProps, nextProps) {
		const isEvent = key => key.startsWith("on");
		const isProperty = key => key !== "children" && !isEvent(key);
		const isNew = (prev, next) => key => prev[key] !== next[key];
		const isDeleted = (prev, next) => key => !(key in next);
		const getEventName = (name) => name.toLowerCase().substring(2);
	
		// Remove old properties
		Object.keys(prevProps)
    .filter(isProperty)
    .filter(isDeleted(prevProps, nextProps))
    .forEach(name => {
      dom[name] = ""
    })
	
		// Remove old or changed event listeners properties
		Object.keys(prevProps)
    .filter(isEvent)
    .filter(
      key =>
        !(key in nextProps) ||
        isNew(prevProps, nextProps)(key)
    )
    .forEach(name => {
      dom.removeEventListener(
        getEventName(name),
        prevProps[name]
      )
    })
			
		// Add event listeners
		Object.keys(nextProps)
		.filter(isEvent)
		.filter(isNew(prevProps, nextProps))
		.forEach(name => {
			dom.addEventListener(
				getEventName(name),
				nextProps[name]
			)
		})
	
		// Set new or changed properties
		Object.keys(nextProps)
		.filter(isProperty)
		.filter(isNew(prevProps, nextProps))
		.forEach(name => {
			dom[name] = nextProps[name]
		})
	}
	
	/*******************************  Hooks  *******************************/
	function useState(defaultValue) {
		const oldHook = workInProgressFiber?.alternate?.hooks?.[hookIndex];
		const hook = {
			state: oldHook ? oldHook.state : defaultValue,
			// Used for setState
			queue: [],
		}
	
		// Run actions
		oldHook?.queue?.forEach(action => {
			hook.state = action(hook.state);
		})

		const setState = action => {
			hook.queue.push(action);
			// Totally smae with render
			workInProgressRoot = {
				dom: currentRoot.dom,
				props: currentRoot.props,
				alternate: currentRoot
			}
			nextUnitOfWork = workInProgressRoot;
			deletions = [];
		}
	
		workInProgressFiber.hooks.push(hook);
		hookIndex ++;
		return [ hook.state, setState ];
	}

	function useEffect(effect, deps) {
		const oldHook = workInProgressFiber?.alternate?.hooks?.[hookIndex];

		const hasDepsChanged = 
			!oldHook?.deps ||
			!deps ||
			oldHook.deps.length !== deps.length ||
			deps.some((dep, index) => dep !== oldHook.deps[index])

		const hook = {
			tag: "effect",
			effect: hasDepsChanged ? effect : null,
			cancel: hasDepsChanged && oldHook && oldHook.cancel,
			deps,
		}

		workInProgressFiber.hooks.push(hook);
		hookIndex ++;
	}

	function runEffect(fiber) {
		if(!fiber.hooks) {
			return;
		}

		fiber.hooks.filter(hook => hook.tag === "effect" && hook.effect)
		.forEach(hook => hook.cancel = hook.effect());
	}
	function cancelEffect(fiber) {
		if(!fiber.alternate.hooks) {
			return;
		}

		fiber.alternate.hooks.filter(hook => hook.tag === "effect" && hook.cancel)
		.forEach(hook => hook.cancel());
	}

	// Export entry function
	return {
		createElement,
		render,
		useState,
		useEffect,
	}
})()