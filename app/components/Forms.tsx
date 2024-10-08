"use client";

import { RegularArrowUp } from "lineicons-react";
import { useFormState, useFormStatus } from "react-dom";

// function SubmitButton({className, name, pendingName} : {className?: string, name: string, pendingName?: string}) {
//   let {pending} = useFormStatus();
//   return (
//       <div className={className ? className : "bg-white rounded-sm font-semibold p-14 pt-0 pb-0 pl-0 w-full"}>
//           <input type="submit" value={pending ? (pendingName ? pendingName : name) : name}/>
//       </div>
//   )
// }

//TODO: Make this work for more generic forms
// export default function GenericFormServerAction({className, submitButtonClassName, serverAction, submitName, submitPendingName, clearOnSuccess, children} : {
//   className?: string,
//   submitButtonClassName?: string,
//   serverAction: ((state: string, formData: FormData) => Promise<string>),
//   submitName: string,
//   submitPendingName?: string,
//   clearOnSuccess?: boolean,
//   children: any}
// ) : JSX.Element {
//   let [error, formAction] = useFormState<any, FormData>(serverAction, "");

//   return (
//     <form className={className ? className : "bg-white rounded-sm p-14 pt-10 pb-10 w-full"} action={formAction}>
//       {children}
//       <p className="text-sm text-red-500">{error}</p>
//       <SubmitButton className={submitButtonClassName} name={submitName} pendingName={submitPendingName}/>
//     </form>
//   )
// }

export function InlineServerActionForm({
	serverAction,
	children
}: {
	serverAction: (state: string, formData: FormData) => Promise<string>;
	children: any;
}) {
	let [error, formAction] = useFormState<any, FormData>(serverAction, "");

	return (
		<>
			<form className="p-1 m-0 inline-block" action={formAction}>
				{children}
				<input
					type="submit"
					className="bg-cool-black rounded-md p-2 inline"></input>
			</form>
		</>
	);
}
