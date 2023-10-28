package com.example.demo.demos.webservice.service;
import javax.jws.WebService;


@WebService(
        name = "myPortType",                 //portType名称 客户端生成代码时 为接口名称
        serviceName = "myService",           //服务name名称
        portName = "myPortName",             //port名称
        endpointInterface = "com.example.demo.demos.webservice.service.MyService")
//指定发布webservice的接口类，此类也需要接入@WebService注解
public class MyServiceImpl implements MyService {


    public double calculatePersonalIncomeTax(double grossIncome) {
        double threshold = 5000; // 起征点
        double socialInsurance = grossIncome * 0.1; // 五险一金
        double taxableIncome = grossIncome - threshold - socialInsurance;

        double tax = 0.0;

        if (taxableIncome <= 0) {
            // 不需要缴税
            tax = 0.0;
        } else if (taxableIncome <= 3000) {
            // 0 - 3000元部分，交税百分之三
            tax = taxableIncome * 0.03;
        } else if (taxableIncome <= 12000) {
            // 3000 - 12000元部分，交税百分之十
            tax = 3000 * 0.03 + (taxableIncome - 3000) * 0.1;
        } else if (taxableIncome <= 25000) {
            // 12000 - 25000元部分，交税百分之二十
            tax = 3000 * 0.03 + 9000 * 0.1 + (taxableIncome - 12000) * 0.2;
        } else if (taxableIncome <= 35000) {
            // 25000 - 35000元部分，交税百分之二十五
            tax = 3000 * 0.03 + 9000 * 0.1 + 13000 * 0.2 + (taxableIncome - 25000) * 0.25;
        } else if (taxableIncome <= 55000) {
            // 35000 - 55000元部分，交税百分之三十
            tax = 3000 * 0.03 + 9000 * 0.1 + 13000 * 0.2 + 10000 * 0.25 + (taxableIncome - 35000) * 0.3;
        } else if (taxableIncome <= 80000) {
            // 55000 - 80000元部分，交税百分之三十五
            tax = 3000 * 0.03 + 9000 * 0.1 + 13000 * 0.2 + 10000 * 0.25 + 20000 * 0.3 + (taxableIncome - 55000) * 0.35;
        } else {
            // 超过80000元部分，交税百分之四十五
            tax = 3000 * 0.03 + 9000 * 0.1 + 13000 * 0.2 + 10000 * 0.25 + 20000 * 0.3 + 25000 * 0.35 + (taxableIncome - 80000) * 0.45;
        }

        return tax;
    }

}
