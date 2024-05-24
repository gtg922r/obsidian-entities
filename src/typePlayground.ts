/* eslint-disable @typescript-eslint/no-unused-vars */


abstract class BaseClass {
	constructor(public name: string) {}

	static staticMethod1() {
		console.log("Static method 1 in BaseClass");
	}

	static staticMethod2() {
		console.log("Static method 2 in BaseClass");
	}

	abstract instanceMethod(): void;
}
// Example concrete classes
class DerivedClass1 extends BaseClass {
	constructor(name: string) {
		super(name);
	}

	static staticMethod1() {
		console.log("Static method 1 in DerivedClass1");
	}

	static staticMethod2() {
		console.log("Static method 2 in DerivedClass1");
	}

	instanceMethod() {
		console.log("Instance method in DerivedClass1");
	}
}

class DerivedClass2 extends BaseClass {
	constructor(name: string) {
		super(name);
	}

	static staticMethod1() {
		console.log("Static method 1 in DerivedClass2");
	}

	static staticMethod2() {
		console.log("Static method 2 in DerivedClass2");
	}

	instanceMethod() {
		console.log("Instance method in DerivedClass2");
	}
}

interface ClassConfigBase {
	name: string;
}

abstract class BaseGeneric<T extends ClassConfigBase> {
	constructor(public name: T) {}

	static staticMethod1() {
		console.log("Static method 1 in BaseClass");
	}

	static staticMethod2<T extends ClassConfigBase>(arg1: T) {
		console.log("Static method 2 in BaseClass");
	}

	abstract instanceMethod(): void;
}
// Example concrete classes
interface DerivedConfig1 extends ClassConfigBase {
	height: number;
}
class DerivedGeneric1<T extends ClassConfigBase> extends BaseGeneric<T> {
	constructor(name: T) {
		super(name);
	}

	static staticMethod1() {
		console.log("Static method 1 in DerivedClass1");
	}

	static staticMethod2<T extends DerivedConfig1>(arg1: T) {
		console.log("Static method 2 in DerivedClass1");
	}

	instanceMethod() {
		console.log("Instance method in DerivedClass1");
	}
}

interface DerivedConfig2 extends ClassConfigBase {
	age: number;
}

class DerivedGeneric2<T extends ClassConfigBase> extends BaseGeneric<T> {
	constructor(name: T) {
		super(name);
	}

	static staticMethod1() {
		console.log("Static method 1 in DerivedClass1");
	}

	static staticMethod2() {
		console.log("Static method 2 in DerivedClass1");
	}

	instanceMethod() {
		console.log("Instance method in DerivedClass1");
	}
}

/* // This works with defined signature 
type MethodKeys<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
  }[keyof T];
type Methods<T> = Pick<T, MethodKeys<T>>;
type DerivedFrom<T> = { new (name: string): T };
type DerivedClass<T extends abstract new (...args: any) => any> = Methods<T> & DerivedFrom<InstanceType<T>>;
*/

/* // Works with generic for signature
type MethodKeys<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
  }[keyof T];
type Methods<T> = Pick<T, MethodKeys<T>>;
type DerivedFrom<U, T> = { new (name: U): T };
type DerivedClass<U, T extends abstract new (...args: any) => any> = Methods<T> & DerivedFrom<U, InstanceType<T>>;

const derivedClasses: DerivedClass<string, typeof BaseClass>[] = [DerivedClass1, DerivedClass2];
const derivedGenerics: DerivedClass<ClassConfigBase, typeof BaseGeneric>[] = [DerivedGeneric1, DerivedGeneric2];
*/



type DerivedFrom<T, Arguments extends unknown[] = any[]> = { new (...args: Arguments): T };
type PropertyKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];
type MethodKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];
type Methods<T> = Pick<T, MethodKeys<T>>;
type Members<T> = Pick<T, PropertyKeys<T> | MethodKeys<T>>;

// DerivedClass type combining Methods and DerivedFrom
type DerivedClassWithConstructorSignature<T extends abstract new (...args: any) => any, Arguments extends unknown[] = any[]> = Members<T> & DerivedFrom<InstanceType<T>, Arguments>;

const c1: typeof BaseClass = DerivedClass1;
const h1: typeof DerivedClass1 = BaseClass;
const e1: typeof DerivedClass1 = DerivedClass1;
const l1: Methods<typeof BaseClass> = DerivedClass1;
const m1: Members<typeof BaseClass> & DerivedFrom<BaseClass> = DerivedClass1;
const n1: Members<typeof BaseClass> & DerivedFrom<BaseClass> = BaseClass;
const o1: DerivedClassWithConstructorSignature<typeof BaseClass, [string]> = DerivedClass1;
const p1: DerivedClassWithConstructorSignature<typeof BaseClass, [string]> = BaseClass;


l1.staticMethod1();
m1.staticMethod1();
const lNew = new l1("test");
const mNew = new m1("test");

o1.staticMethod1();
p1.staticMethod1();
const oNew = new o1("test");
const pNew = new p1("test");

// const derivedClasses: DerivedClass<string, typeof BaseClass>[] = [DerivedClass1, DerivedClass2];
const derivedClasses: DerivedClassWithConstructorSignature<typeof BaseClass, string>[] = [DerivedClass1, DerivedClass2];
derivedClasses.forEach((cls) => {
	const instance = new cls("test");
	cls.staticMethod1();
	cls.staticMethod2();
});



const derivedGeneric: DerivedClassWithConstructorSignature<typeof BaseGeneric<ClassConfigBase>, ClassConfigBase> = DerivedGeneric1;
const derivedGenerics: DerivedClassWithConstructorSignature<typeof BaseGeneric<ClassConfigBase>, ClassConfigBase>[] = [DerivedGeneric1, DerivedGeneric2];
derivedGenerics.forEach((cls) => {
	const instance = new cls({ name: "test" });
	cls.staticMethod1();
	cls.staticMethod2();
});


interface EntityProviderUserSettings {
	providerType: string;
}

abstract class EntityProvider<T extends EntityProviderUserSettings> {
	protected settings: T;
	static staticProperty = "Base Entity Provider";
	
	abstract abstractMethod1(): T;

	constructor(plugin: {app:any}, settings: Partial<T>) {

	}

	static staticMethod<T>(settings: T): string {
		return "Entity Provider";
	}
}

class derivedProvider1<T extends EntityProviderUserSettings> extends EntityProvider<T> {
	private defaultSettings: T;
	abstractMethod1(): T {
		return this.defaultSettings;
	}
}

interface providerConstructor<T extends EntityProviderUserSettings> {
	new (plugin: { app: any }, settings: Partial<T>): EntityProvider<T>;
}

const derivedProviders: DerivedClassWithConstructorSignature<typeof EntityProvider, [{app: any}, EntityProviderUserSettings]>[] = [derivedProvider1, derivedProvider1];
derivedProviders.forEach((cls) => {
	const instance = new cls({ app: null }, { providerType: "test" });
	console.log(cls.staticMethod({ providerType: "test" }));
	console.log(cls.staticProperty);
	console.log(instance.abstractMethod1());
});


/*

abstract class SampleClass {
	static staticMethod() {
		return "I am static";
	}

	constructor(a:string) {
		console.log(a);
	}

	abstract instanceMethod(): string;
}

const objectWithSampleClassStaticMethod = {
	staticMethod: (() => "I am static") as () => string
};

type Constructor<T> = new (...args: any[]) => T;

type StaticMethods<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : never;
};

type ConstructorAndStatic<T> = StaticMethods<T> & Constructor<T>;


// Utility type to extract static methods
type ExtractStaticMethods<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : never;
};

// Define a type for concrete classes extending BaseClass
type ConcreteClass<T extends typeof SampleClass> = T & {
    new (...args: ConstructorParameters<typeof SampleClass>): InstanceType<T>;
} & ExtractStaticMethods<typeof SampleClass>;



// Sample usage to inspect types
const a: typeof SampleClass = SampleClass; 						// OK, b/c typeof SampleClass implies type of the class itself
const b: SampleClass = SampleClass;								// NOK, b/c SampleClass implies type of an INSTANCE of the class
const c: new (...args: any) => any = SampleClass;				// OK, b/c its a generic constructor, which is all the SampleClass type is
const d: new (a:string) => void = SampleClass;					// OK, b/c its a specific constructor, which is all the SampleClass type is
const e: typeof SampleClass = objectWithSampleClassStaticMethod;
const g: ExtractStaticMethods<typeof SampleClass> = SampleClass;
const f: typeof SampleClass = SampleClass.constructor;
const z: StaticMethods<typeof SampleClass> = SampleClass;			
const test: ConstructorAndStatic<typeof SampleClass> = SampleClass;


class ExtendClassAlpha extends SampleClass {
	static staticMethod() {
		return "I am static - Alpha";
	}

	instanceMethod(): string {
		return "I am an instance method - Alpha";
	}
}


// const listClass:((typeof SampleClass) & Constructor<SampleClass>)[] = [ExtendClassAlpha, ExtendClassAlpha, ExtendClassAlpha];
const listClass:ConcreteClass<typeof SampleClass>[] = [ExtendClassAlpha, ExtendClassAlpha, ExtendClassAlpha];
listClass.forEach((c) => {
	console.log(c.staticMethod());
	const inst = new c("a");	
	console.log(inst.instanceMethod());
});

*/
